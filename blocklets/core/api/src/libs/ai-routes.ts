import { ChatModelOutput } from '@aigne/core';
import { camelize } from '@aigne/core/utils/camelize';
import { checkModelRateAvailable } from '@api/providers';
import { chatCompletionByFrameworkModel, getImageModel } from '@api/providers/models';
import { getModelAndProviderId } from '@api/providers/util';
import {
  ChatCompletionChunk,
  ChatCompletionInput,
  ChatCompletionResponse,
  ChatCompletionUsage,
  EmbeddingInput,
  ImageGenerationInput,
  isChatCompletionChunk,
  isChatCompletionUsage,
} from '@blocklet/aigne-hub/api/types';
import { CustomError } from '@blocklet/error';
import { get_encoding } from '@dqbd/tiktoken';
import { Request, Response } from 'express';
import Joi from 'joi';
import pick from 'lodash/pick';
import { ImageEditParams, ImagesResponse } from 'openai/resources/images';

import { getOpenAIV2 } from './ai-provider';
import { Config } from './env';
import { processImageUrl } from './image';
import logger from './logger';

interface ImageResult {
  base64?: string;
  url?: string;
}

// Common Joi Schemas
export const completionsRequestSchema = Joi.object<
  { model: string } & (
    | (ChatCompletionInput & { prompt: undefined })
    | (Omit<ChatCompletionInput, 'messages'> & { messages: undefined; prompt: string })
  )
>({
  model: Joi.string().empty(['', null]).default('gpt-3.5-turbo'),
  prompt: Joi.string(),
  messages: Joi.array()
    .items(
      Joi.object({
        role: Joi.string().valid('system', 'user', 'assistant', 'tool').required(),
      })
        .when(Joi.object({ role: Joi.valid('system') }).unknown(), {
          then: Joi.object({
            content: Joi.string().allow(null, '').required(),
            name: Joi.string().empty([null, '']),
          }),
        })
        .when(Joi.object({ role: Joi.valid('user') }).unknown(), {
          then: Joi.object({
            content: Joi.alternatives(
              Joi.string().allow(null, ''),
              Joi.array().items(
                Joi.object({
                  type: Joi.string().valid('text', 'image_url').required(),
                })
                  .when(Joi.object({ type: Joi.valid('text') }).unknown(), {
                    then: Joi.object({
                      text: Joi.string().required(),
                    }),
                  })
                  .when(Joi.object({ type: Joi.valid('image_url') }).unknown(), {
                    then: Joi.object({
                      imageUrl: Joi.object({
                        url: Joi.string().required(),
                      }).required(),
                    }),
                  })
              )
            ).required(),
            name: Joi.string().empty([null, '']),
          }),
        })
        .when(Joi.object({ role: Joi.valid('assistant') }).unknown(), {
          then: Joi.object({
            content: Joi.string().allow(null, ''),
            name: Joi.string().empty([null, '']),
            toolCalls: Joi.array().items(
              Joi.object({
                id: Joi.string().required(),
                type: Joi.string().valid('function').required(),
                function: Joi.object({
                  name: Joi.string().required(),
                  arguments: Joi.string().required(),
                }).required(),
              })
            ),
          }),
        })
        .when(Joi.object({ role: Joi.valid('tool') }).unknown(), {
          then: Joi.object({
            content: Joi.string().allow('').required(),
            toolCallId: Joi.string().required(),
          }),
        })
    )
    .min(1),
  stream: Joi.boolean().empty([null, '']),
  temperature: Joi.number().min(0).max(2).empty([null, '']),
  topP: Joi.number().min(0.1).max(1).empty([null, '']),
  presencePenalty: Joi.number().min(-2).max(2).empty([null, '']),
  frequencyPenalty: Joi.number().min(-2).max(2).empty([null, '']),
  maxTokens: Joi.number().integer().min(1).empty([null, '']),
  tools: Joi.array()
    .items(
      Joi.object({
        type: Joi.string().valid('function').required(),
        function: Joi.object({
          name: Joi.string().required(),
          description: Joi.string().empty([null, '']),
          parameters: Joi.object().pattern(Joi.string(), Joi.any()).required(),
        }).required(),
      })
    )
    .empty(Joi.array().length(0)),
  toolChoice: Joi.alternatives()
    .try(
      Joi.string().valid('auto', 'none', 'required'),
      Joi.object({
        type: Joi.string().valid('function').required(),
        function: Joi.object({
          name: Joi.string().required(),
          description: Joi.string().empty([null, '']),
        }).required(),
      })
    )
    .optional(),
  responseFormat: Joi.object({
    type: Joi.string().valid('text', 'json_object', 'json_schema').empty([null, '']),
  }).when(Joi.object({ type: Joi.valid('json_schema') }), {
    then: Joi.object({
      jsonSchema: Joi.object({
        name: Joi.string().required(),
        description: Joi.string().empty([null, '']),
        schema: Joi.object().pattern(Joi.string(), Joi.any()).required(),
        strict: Joi.boolean().empty([null, '']),
      }),
    }),
  }),
}).xor('prompt', 'messages');

export const embeddingsRequestSchema = Joi.object<EmbeddingInput>({
  model: Joi.string().required(),
  input: Joi.alternatives()
    .try(
      Joi.string(),
      Joi.array().items(Joi.alternatives().try(Joi.string(), Joi.number(), Joi.array().items(Joi.number())))
    )
    .required(),
});

export const imageGenerationRequestSchema = Joi.object<
  ImageGenerationInput & Required<Pick<ImageGenerationInput, 'model' | 'n'>>
>({
  model: Joi.string().empty(['', null]).default('dall-e-2'),
  image: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string())),
  prompt: Joi.string().required(),
  size: Joi.string().empty(['', null]),
  n: Joi.number().min(1).max(10).empty([null]).default(1),
  responseFormat: Joi.string().empty([null]),
});

// Common retry helper
export const createRetryHandler = (
  callback: (req: Request, res: Response) => Promise<void>
): ((req: Request, res: Response) => Promise<void>) => {
  const options = { maxRetries: Config.maxRetries, retryCodes: [429, 500, 502] };

  function canRetry(code: number, retries: number) {
    return options.retryCodes.includes(code) && retries < options.maxRetries;
  }

  const fn = async (req: Request, res: Response, count: number = 0): Promise<void> => {
    try {
      await callback(req, res);
    } catch (error) {
      if (canRetry(error.response?.status, count)) {
        logger.info('ai route retry', { count });
        await fn(req, res, count + 1);
        return;
      }

      throw error;
    }
  };

  return async (req: Request, res: Response): Promise<void> => {
    await fn(req, res, 0);
  };
};

// Core completions logic - returns usage data for caller to handle
export async function processChatCompletion(
  req: Request,
  res: Response,
  version: 'v1' | 'v2' = 'v1',
  options?: {
    onEnd?: (data?: { output?: ChatModelOutput }) => Promise<{ output?: ChatModelOutput } | undefined>;
  }
): Promise<{ promptTokens: number; completionTokens: number; model: string; modelParams: Record<string, any> } | null> {
  const { error, value: body } = completionsRequestSchema.validate(req.body, { stripUnknown: true });
  if (error) {
    throw new CustomError(400, error.message);
  }

  const input = {
    ...body,
    messages: typeof body.prompt === 'string' ? [{ role: 'user' as const, content: body.prompt }] : body.messages,
  };

  await checkModelRateAvailable(input.model);

  if (Config.verbose) logger.info(`AIGNE Hub ${version} completions input:`, body);

  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-cache');

  const isEventStream = req.accepts().some((i) => i.startsWith('text/event-stream'));

  const result = await chatCompletionByFrameworkModel(input, req.user?.did, {
    ...options,
    req,
  });

  let content = '';
  const toolCalls: NonNullable<ChatCompletionChunk['delta']['toolCalls']> = [];

  const emitEventStreamChunk = (chunk: ChatCompletionResponse) => {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.flushHeaders();
    }

    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    res.flush();
  };

  let usage: ChatCompletionUsage['usage'] | undefined;

  try {
    for await (const chunk of result) {
      if (isChatCompletionUsage(chunk)) {
        usage = chunk.usage;
      }

      if (isEventStream) {
        emitEventStreamChunk(chunk);
      }

      if (isChatCompletionChunk(chunk)) {
        content += chunk.delta?.content || '';

        if (chunk.delta?.toolCalls?.length) toolCalls.push(...chunk.delta.toolCalls);

        if (input.stream && !isEventStream && chunk.delta?.content) {
          res.write(chunk.delta.content);
          res.flush();
        }
      }
    }
  } catch (error) {
    logger.error('Run AI error', { error });
    if (req.modelCallContext) {
      req.modelCallContext.fail(error.message).catch((err) => {
        logger.error('Failed to mark incomplete model call as failed', { error: err });
      });
    }
    if (isEventStream) {
      emitEventStreamChunk({ error: { message: error.message } });
    } else if (input.stream) {
      res.write(`ERROR: ${error.message}`);
      res.flush();
    }
    res.end();
    return null;
  }

  if (!input.stream && !isEventStream) {
    res.json({
      role: 'assistant',
      // Deprecated: use `content` instead.
      text: content,
      content,
      toolCalls: toolCalls.length ? toolCalls : undefined,
    });
  }

  res.end();

  if (Config.verbose) logger.info(`AIGNE Hub ${version} completions output:`, { content, toolCalls });

  if (!usage) {
    // TODO: 更精确的 token 计算，暂时简单地 stringify 之后按照 gpt3/4 的 token 算法计算，尤其 function call 的计算偏差较大，需要改进
    const enc = get_encoding('cl100k_base');
    try {
      const promptTokens = enc.encode(JSON.stringify(input.messages)).length;
      const completionTokens = enc.encode(JSON.stringify({ content, toolCalls })).length;

      usage = { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
    } finally {
      enc.free();
    }
  }

  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    model: input.model,
    modelParams: pick(input, 'temperature', 'topP', 'frequencyPenalty', 'presencePenalty', 'maxTokens'),
  };
}

// Core embeddings logic - returns usage data for caller to handle
export async function processEmbeddings(
  req: Request,
  res: Response
): Promise<{ promptTokens: number; model: string } | null> {
  const { error, value: input } = embeddingsRequestSchema.validate(req.body, { stripUnknown: true });
  if (error) {
    throw new CustomError(400, error.message);
  }

  await checkModelRateAvailable(input.model);

  const openai = await getOpenAIV2(req);

  const { data, usage } = await openai.embeddings.create(input);

  res.json({ data });

  return {
    promptTokens: usage.prompt_tokens,
    model: input.model,
  };
}

// Core image generation logic - returns usage data for caller to handle
export async function processImageGeneration({
  req,
  version,
  inputBody,
}: {
  inputBody: ImageGenerationInput & Required<Pick<ImageGenerationInput, 'model' | 'n'>>;
  req: Request;
  res: Response;
  version: 'v1' | 'v2';
}): Promise<{
  model: string;
  modelParams: Record<string, any>;
  numberOfImageGeneration: number;
  images: { url?: string; b64Json?: string; b64_json?: string }[];
  modelName: string;
} | null> {
  logger.info('process image generation input body', { inputBody });

  const { error, value: input } = imageGenerationRequestSchema.validate(inputBody, { stripUnknown: true });

  if (error) {
    throw new CustomError(400, error.message);
  }

  logger.info('process image generation input', { input });

  await checkModelRateAvailable(input.model);

  if (Config.verbose) logger.info(`AIGNE Hub ${version} image generations input:`, input);

  let response: ImagesResponse;
  const { modelName } = await getModelAndProviderId(input.model);

  const isImageValid = (image: string | string[] | undefined): image is string[] => {
    if (typeof image === 'string' && image) return true;
    if (Array.isArray(image) && image.length > 0) return true;
    return false;
  };

  if (input.model === 'gpt-image-1' && isImageValid(input.image)) {
    const images = Array.isArray(input.image) ? input.image : [input.image];
    const uploadableImage = await Promise.all(images.map((i) => processImageUrl(i)));

    const openai = await getOpenAIV2(req);
    response = await openai.images.edit({
      model: input.model,
      prompt: input.prompt,
      image: uploadableImage,
      n: input.n,
      size: input.size,
      quality: input.quality,
    } as ImageEditParams);
  } else {
    const formatParams = () => {
      if (input.model.includes('google')) {
        return { ...input, response_format: 'b64_json' as const };
      }

      return input;
    };

    const { modelInstance } = await getImageModel(input, { req });
    const params: { prompt: string; [key: string]: any } = camelize({ ...formatParams(), model: modelName });
    logger.info('invoke image generation params', { params });

    const result = await modelInstance.invoke({
      ...params,
      responseFormat: params.responseFormat === 'b64_json' ? 'base64' : params.responseFormat || 'base64',
    });

    response = {
      data: result.images.map((i: ImageResult) => ({ b64_json: i.base64, url: i.url })),
      created: Date.now(),
    };
  }

  return {
    model: input.model,
    modelParams: pick(input, 'size', 'responseFormat', 'style', 'quality'),
    numberOfImageGeneration: input.n,

    images:
      response.data?.map((i) => ({ base64: i.b64_json, b64_json: i.b64_json, b64Json: i.b64_json, url: i.url })) || [],
    modelName,
  };
}
