import { auth, component } from '@blocklet/sdk/lib/middlewares';
import compression from 'compression';
import { Request, Response, Router } from 'express';
import proxy from 'express-http-proxy';
import { GPTTokens } from 'gpt-tokens';
import Joi from 'joi';
import { pick } from 'lodash';
import {
  ChatCompletionAssistantMessageParam,
  ChatCompletionChunk,
  ChatCompletionContentPartImage,
  ChatCompletionContentPartText,
  ChatCompletionSystemMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
  ChatCompletionToolMessageParam,
  ChatCompletionUserMessageParam,
  EmbeddingCreateParams,
  ImageGenerateParams,
} from 'openai/resources';

import { getAIProvider } from '../libs/ai-provider';
import { Config } from '../libs/env';
import logger from '../libs/logger';
import { ensureAdmin } from '../libs/security';
import Usage from '../store/models/usage';

const router = Router();

async function status(_: Request, res: Response) {
  const { openaiApiKey } = Config;
  const arr = Array.isArray(openaiApiKey) ? openaiApiKey : [openaiApiKey];
  res.json({ available: !!arr.filter(Boolean).length });
}

router.get('/status', ensureAdmin, status);
router.get('/sdk/status', component.verifySig, status);

export const Models = [
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-0301',
  'gpt-3.5-turbo-0613',
  'gpt-3.5-turbo-16k',
  'gpt-3.5-turbo-16k-0613',
  'gpt-4',
  'gpt-4-0314',
  'gpt-4-0613',
  'gpt-4-32k',
  'gpt-4-32k-0314',
  'gpt-4-32k-0613',
] as const;

export type Model = (typeof Models)[number];

const completionsRequestSchema = Joi.object<
  {
    stream?: boolean;
    model: Model;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    maxTokens?: number;
    tools?: ChatCompletionTool[];
    toolChoice?: ChatCompletionToolChoiceOption;
  } & (
    | {
        prompt: string;
        messages: undefined;
      }
    | {
        prompt: undefined;
        messages: (
          | (ChatCompletionSystemMessageParam & { name?: string | null })
          | (Omit<ChatCompletionUserMessageParam, 'content'> & {
              name?: string | null;
              content:
                | string
                | Array<
                    | ChatCompletionContentPartText
                    | (Omit<ChatCompletionContentPartImage, 'image_url'> & {
                        imageUrl: ChatCompletionContentPartImage['image_url'];
                      })
                  >
                | null;
            })
          | (Omit<ChatCompletionAssistantMessageParam, 'function_call' | 'tool_calls'> & {
              name?: string | null;
              toolCalls?: ChatCompletionAssistantMessageParam['tool_calls'];
            })
          | (Omit<ChatCompletionToolMessageParam, 'tool_call_id'> & {
              toolCallId: ChatCompletionToolMessageParam['tool_call_id'];
            })
        )[];
      }
  )
>({
  model: Joi.string()
    .valid(...Models)
    .default('gpt-3.5-turbo'),
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
                        detail: Joi.string().valid('low', 'high', 'auto').empty([null, '']),
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
            content: Joi.string().allow(null, '').required(),
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
  toolChoice: Joi.alternatives(
    Joi.string().valid('none', 'auto'),
    Joi.object({
      type: Joi.string().valid('function').empty([null]),
      function: Joi.object({
        name: Joi.string().required(),
      }),
    })
  ).empty([null]),
}).xor('prompt', 'messages');

async function completions(req: Request, res: Response) {
  const { model, stream, ...input } = await completionsRequestSchema.validateAsync(req.body, { stripUnknown: true });

  const isEventStream = req.accepts().includes('text/event-stream');

  const openai = getAIProvider();

  const messages = input.messages ?? [{ role: 'user', content: input.prompt }];

  const request: Parameters<typeof openai.chat.completions.create>[0] = {
    model,
    messages: messages.map((msg) => {
      if (msg.role === 'tool') {
        return {
          role: msg.role,
          content: msg.content,
          tool_call_id: msg.toolCallId,
        };
      }
      if (msg.role === 'user') {
        return {
          role: msg.role,
          content: Array.isArray(msg.content)
            ? msg.content.map((i) => {
                if (i.type === 'text') return { type: i.type, text: i.text };
                return { type: i.type, image_url: i.imageUrl };
              })
            : msg.content,
          name: msg.name,
        };
      }
      if (msg.role === 'assistant') {
        return {
          role: msg.role,
          content: msg.content,
          name: msg.name,
          tool_calls: msg.toolCalls,
        };
      }
      return msg;
    }),
    temperature: input.temperature,
    top_p: input.topP,
    presence_penalty: input.presencePenalty,
    frequency_penalty: input.frequencyPenalty,
    max_tokens: input.maxTokens,
    tools: input.tools,
    tool_choice: input.tools?.length ? input.toolChoice : undefined,
  };

  if (Config.verbose) logger.log('AI Kit completions input:', JSON.stringify(request, null, 2));

  let content = '';
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;

  if (stream || isEventStream) {
    const r = await openai.chat.completions.create({ ...request, stream: true });

    const decoder = new TextDecoder();

    const reader = r.toReadableStream().getReader();

    while (true) {
      const { value, done } = await reader.read();

      if (value) {
        const json: ChatCompletionChunk = JSON.parse(decoder.decode(value));

        const choice = json.choices[0];
        if (choice) {
          const {
            delta: { role, ...delta },
          } = choice;

          content += delta.content || '';

          if (isEventStream) {
            if (!res.headersSent) {
              res.setHeader('Content-Type', 'text/event-stream');
              res.flushHeaders();
            }

            res.write(
              `data: ${JSON.stringify({
                delta: {
                  role,
                  content: delta.content,
                  toolCalls: delta.tool_calls?.map((i) => ({
                    id: i.id,
                    type: i.type,
                    function: i.function && {
                      name: i.function.name,
                      arguments: i.function.arguments,
                    },
                  })),
                },
              })}\n\n`
            );
            res.flush();
          } else if (delta.content) {
            res.write(delta.content);
          }
        }
      }

      if (done) {
        break;
      }
    }

    res.end();
  } else {
    const result = await openai.chat.completions.create({ ...request, stream: false });
    promptTokens = result.usage?.prompt_tokens;
    completionTokens = result.usage?.completion_tokens;

    const message = result.choices[0]?.message;
    content = message?.content || '';

    res.json({
      role: message?.role,
      // Deprecated: use `content` instead.
      text: message?.content,
      content: message?.content,
      toolCalls: message?.tool_calls?.map((i) => ({
        id: i.id,
        type: i.type,
        function: {
          name: i.function.name,
          arguments: i.function.arguments,
        },
      })),
    });
  }

  if (!promptTokens || !completionTokens) {
    // FIXME: GPTTokens 暂不支持计算 function 的 tokens
    const tokens = new GPTTokens({
      model,
      messages: messages
        .concat({ role: 'assistant', content })
        .filter(
          (i): i is ConstructorParameters<typeof GPTTokens>[0]['messages'][number] =>
            ['system', 'user', 'assistant'].includes(i.role) && typeof i.content === 'string'
        )
        .map((i) => pick(i, 'name', 'role', 'content')),
    });

    promptTokens = tokens.promptUsedTokens;
    completionTokens = tokens.completionUsedTokens;
  }

  await Usage.create({
    promptTokens,
    completionTokens,
    apiKey: openai.apiKey,
  });

  if (Config.verbose) logger.log('AI Kit completions output:', { content });
}

const retry = (callback: (req: Request, res: Response) => Promise<void>): any => {
  const options = { maxRetries: Config.maxRetries, retryCodes: [429, 500, 502] };

  function canRetry(code: number, retries: number) {
    return options.retryCodes.includes(code) && retries < options.maxRetries;
  }

  const fn = async (req: Request, res: Response, count: number = 0): Promise<void> => {
    try {
      await callback(req, res);
    } catch (error) {
      if (canRetry(error.response?.status, count)) {
        logger.info('retry', count);
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

router.post('/completions', compression(), ensureAdmin, retry(completions));
router.post('/sdk/completions', compression(), component.verifySig, retry(completions));

const embeddingsRequestSchema = Joi.object<EmbeddingCreateParams>({
  model: Joi.string().required(),
  input: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string())).required(),
  user: Joi.string().empty(Joi.valid('', null)),
});

async function embeddings(req: Request, res: Response) {
  const input = await embeddingsRequestSchema.validateAsync(req.body, { stripUnknown: true });

  const openai = getAIProvider();

  const { data } = await openai.embeddings.create(input);

  res.json({ data });
}

router.post('/embeddings', ensureAdmin, retry(embeddings));
router.post('/sdk/embeddings', component.verifySig, retry(embeddings));

const imageGenerationRequestSchema = Joi.object<{
  model: ImageGenerateParams['model'];
  prompt: string;
  size: ImageGenerateParams['size'];
  n: number;
  response_format: ImageGenerateParams['response_format'];
  style: ImageGenerateParams['style'];
  quality: ImageGenerateParams['quality'];
}>({
  model: Joi.valid('dall-e-2', 'dall-e-3').empty([null, '']).default('dall-e-2'),
  prompt: Joi.string().required(),
  size: Joi.string().valid('256x256', '512x512', '1024x1024', '1024x1792', '1792x1024').default('256x256'),
  n: Joi.number().min(1).max(10).default(1),
  response_format: Joi.string().valid('url', 'b64_json').default('url'),
  style: Joi.string().valid('vivid', 'natural').empty([null, '']),
  quality: Joi.string().valid('standard', 'hd').empty([null, '']),
});

async function imageGenerations(req: Request, res: Response) {
  const input = await imageGenerationRequestSchema.validateAsync(req.body, { stripUnknown: true });

  if (Config.verbose) logger.log('AI Kit image generations input:', input);

  const openai = getAIProvider();

  const response = await openai.images.generate(input);

  res.json({
    data: response.data,
  });
}

router.post('/image/generations', ensureAdmin, retry(imageGenerations));
router.post('/sdk/image/generations', component.verifySig, retry(imageGenerations));

const audioTranscriptions = proxy('api.openai.com', {
  https: true,
  limit: '10mb',
  proxyReqPathResolver() {
    return '/v1/audio/transcriptions';
  },
  proxyReqOptDecorator(proxyReqOpts) {
    proxyReqOpts.headers!.Authorization = `Bearer ${getAIProvider().apiKey}`;
    return proxyReqOpts;
  },
});

router.post('/audio/transcriptions', auth(), audioTranscriptions);
router.post('/sdk/audio/transcriptions', component.verifySig, audioTranscriptions);

const audioSpeech = proxy('api.openai.com', {
  https: true,
  limit: '10mb',
  proxyReqPathResolver() {
    return '/v1/audio/speech';
  },
  proxyReqOptDecorator(proxyReqOpts) {
    proxyReqOpts.headers!.Authorization = `Bearer ${getAIProvider().apiKey}`;
    return proxyReqOpts;
  },
});

router.post('/audio/speech', auth(), audioSpeech);
router.post('/sdk/audio/speech', component.verifySig, audioSpeech);

export default router;
