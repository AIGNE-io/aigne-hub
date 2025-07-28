import { checkModelRateAvailable } from '@api/providers';
import { chatCompletionByFrameworkModel } from '@api/providers/models';
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
import { get_encoding } from '@dqbd/tiktoken';
import { Request, Response } from 'express';
import Joi from 'joi';
import omit from 'lodash/omit';
import pick from 'lodash/pick';
import { ImageEditParams, ImageGenerateParams, ImagesResponse } from 'openai/resources/images';

import { getOpenAIV2 } from './ai-provider';
import { Config } from './env';
import { processImageUrl } from './image';
import logger from './logger';

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
  model: Joi.valid('dall-e-2', 'dall-e-3', 'gpt-image-1').empty(['', null]).default('dall-e-2'),
  image: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string())),
  prompt: Joi.string().required(),
  size: Joi.string()
    .valid('256x256', '512x512', '1024x1024', '1024x1792', '1792x1024', '1536x1024', '1024x1536', 'auto')
    .empty(['', null]),
  n: Joi.number().min(1).max(10).empty([null]).default(1),
  quality: Joi.string().valid('standard', 'hd', 'high', 'medium', 'low', 'auto').empty([null]),
  responseFormat: Joi.string().valid('url', 'b64_json').empty([null]),
  style: Joi.string().valid('vivid', 'natural').empty([null]),
  background: Joi.string().valid('transparent', 'opaque', 'auto').empty([null]).default('auto'),
  outputFormat: Joi.valid('jpeg', 'png', 'webp').empty([null]).default('jpeg'),
  moderation: Joi.valid('low', 'auto').empty([null]).default('auto'),
  outputCompression: Joi.number().min(0).max(100).empty([null]).default(100),
});

// Common retry helper
export const createRetryHandler = (callback: (req: Request, res: Response) => Promise<void>): any => {
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
  version: 'v1' | 'v2' = 'v1'
): Promise<{ promptTokens: number; completionTokens: number; model: string; modelParams: any } | null> {
  const body = await completionsRequestSchema.validateAsync(req.body, { stripUnknown: true });

  const input = {
    ...body,
    messages: typeof body.prompt === 'string' ? [{ role: 'user' as const, content: body.prompt }] : body.messages,
  };

  await checkModelRateAvailable(input.model);

  if (Config.verbose) logger.info(`AIGNE Hub ${version} completions input:`, body);

  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-cache');

  const isEventStream = req.accepts().some((i) => i.startsWith('text/event-stream'));

  const result = await chatCompletionByFrameworkModel(input, req.user?.did);

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
  const input = await embeddingsRequestSchema.validateAsync(req.body, { stripUnknown: true });

  await checkModelRateAvailable(input.model);

  const openai = await getOpenAIV2();

  const { data, usage } = await openai.embeddings.create(input);

  res.json({ data });

  return {
    promptTokens: usage.prompt_tokens,
    model: input.model,
  };
}

// Core image generation logic - returns usage data for caller to handle
export async function processImageGeneration(
  req: Request,
  res: Response,
  version: 'v1' | 'v2' = 'v1'
): Promise<{ model: string; modelParams: any; numberOfImageGeneration: number } | null> {
  const input = await imageGenerationRequestSchema.validateAsync(
    {
      ...req.body,
      // Deprecated: 兼容 response_format 字段，一段时间以后删除
      responseFormat: req.body.response_format || req.body.responseFormat,
    },
    { stripUnknown: true }
  );

  await checkModelRateAvailable(input.model);

  if (Config.verbose) logger.info(`AIGNE Hub ${version} image generations input:`, input);

  const openai = await getOpenAIV2();
  let response: ImagesResponse;

  const isImageValid = (image: string | string[] | undefined): image is string[] => {
    if (typeof image === 'string' && image) return true;
    if (Array.isArray(image) && image.length > 0) return true;
    return false;
  };

  if (input.model === 'gpt-image-1' && isImageValid(input.image)) {
    const images = Array.isArray(input.image) ? input.image : [input.image];
    const uploadableImage = await Promise.all(images.map((i) => processImageUrl(i)));

    response = await openai.images.edit({
      model: input.model,
      prompt: input.prompt,
      image: uploadableImage,
      n: input.n,
      size: input.size,
      quality: input.quality,
    } as ImageEditParams);
  } else {
    const modelParams: Record<string, Partial<ImageGenerateParams>> = {
      'dall-e-2': { response_format: input.responseFormat },
      'dall-e-3': {
        response_format: input.responseFormat,
        quality: input.quality,
        style: input.style,
      },
      'gpt-image-1': {
        quality: input.quality,
        background: input.background,
        output_format: input.outputFormat,
        moderation: input.moderation,
        output_compression: input.outputCompression,
      },
    };

    const params: Partial<ImageGenerateParams> = {
      ...omit(input, [
        'image',
        'quality',
        'style',
        'responseFormat',
        'background',
        'outputFormat',
        'moderation',
        'outputCompression',
      ]),
      ...modelParams[input.model],
    };

    response = await openai.images.generate(params as ImageGenerateParams);
  }

  res.json({
    data: response.data?.map((i) => ({
      // Deprecated: use b64Json instead
      b64_json: i.b64_json,
      b64Json: i.b64_json,
      url: i.url,
    })),
  });

  return {
    model: input.model,
    modelParams: pick(input, 'size', 'responseFormat', 'style', 'quality'),
    numberOfImageGeneration: input.n,
  };
}
