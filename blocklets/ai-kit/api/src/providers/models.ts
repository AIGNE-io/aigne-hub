import type { Agent } from 'node:https';

import { AnthropicChatModel } from '@aigne/anthropic';
import { BedrockChatModel } from '@aigne/bedrock';
import {
  AgentResponseStream,
  ChatModel,
  ChatModelOptions,
  ChatModelOutput,
  Message,
  isAgentResponseDelta,
} from '@aigne/core';
import { DeepSeekChatModel } from '@aigne/deepseek';
import { GeminiChatModel } from '@aigne/gemini';
import { OllamaChatModel } from '@aigne/ollama';
import { OpenRouterChatModel } from '@aigne/open-router';
import { OpenAIChatModel } from '@aigne/openai';
import type { OpenAIChatModelOptions } from '@aigne/openai';
import { XAIChatModel } from '@aigne/xai';
import { SubscriptionError, SubscriptionErrorType } from '@blocklet/ai-kit/api';
import { ChatCompletionChunk, ChatCompletionInput, ChatCompletionResponse } from '@blocklet/ai-kit/api/types';
import { NodeHttpHandler, streamCollector } from '@smithy/node-http-handler';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { pick } from 'lodash';

import { Config } from '../libs/env';

function convertToFrameworkMessages(
  messages: ChatCompletionInput['messages']
): import('@aigne/core').ChatModelInputMessage[] {
  return messages.map((message): import('@aigne/core').ChatModelInputMessage => {
    switch (message.role) {
      case 'system':
        return {
          role: 'system' as const,
          content: message.content,
        };

      case 'user':
        return {
          role: 'user' as const,
          content:
            typeof message.content === 'string'
              ? message.content
              : message.content.map((item) => {
                  if (item.type === 'text') {
                    return { type: 'text', text: item.text };
                  }
                  if (item.type === 'image_url') {
                    return { type: 'image_url', url: item.imageUrl.url };
                  }
                  return item;
                }),
        };

      case 'assistant':
        return {
          role: 'agent' as const,
          content: message.content,
          toolCalls: (message.toolCalls || [])?.map((call) => ({
            id: call.id,
            type: 'function' as const,
            function: {
              name: call.function.name,
              arguments: call.function.arguments as unknown as Message,
            },
          })),
        };

      case 'tool':
        return {
          role: 'tool' as const,
          content: message.content,
          toolCallId: message.toolCallId,
        };

      default:
        // @ts-ignore
        throw new Error(`Unknown message role: ${message.role}`);
    }
  });
}

const providers = {
  openai: 'openai',
  anthropic: 'anthropic',
  bedrock: 'bedrock',
  deepseek: 'deepseek',
  google: 'google',
  ollama: 'ollama',
  openRouter: 'openRouter',
  xai: 'xai',
} as const;

type AIProvider = keyof typeof providers;

export function availableModels(): {
  name: string;
  provider: AIProvider;
  create: (options: {
    model?: string;
    modelOptions?: ChatModelOptions;
    clientOptions?: OpenAIChatModelOptions['clientOptions'];
  }) => ChatModel;
}[] {
  const { httpsProxy } = Config;
  const proxy = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']
    .map((i) => process.env[i] ?? (httpsProxy === undefined ? undefined : httpsProxy === i ? httpsProxy : undefined))
    .filter(Boolean)[0];

  const httpAgent = proxy ? (new HttpsProxyAgent(proxy) as Agent) : undefined;
  const clientOptions = { fetchOptions: { agent: httpAgent } };

  return [
    {
      name: OpenAIChatModel.name,
      provider: providers.openai,
      create: (params) => new OpenAIChatModel({ ...params, clientOptions }),
    },
    {
      name: AnthropicChatModel.name,
      provider: providers.anthropic,
      create: (params) => new AnthropicChatModel({ ...params, clientOptions }),
    },
    {
      name: BedrockChatModel.name,
      provider: providers.bedrock,
      create: (params) =>
        new BedrockChatModel({
          ...params,
          clientOptions: {
            requestHandler: NodeHttpHandler.create({ httpAgent, httpsAgent: httpAgent }),
            streamCollector,
          },
        }),
    },
    {
      name: DeepSeekChatModel.name,
      provider: providers.deepseek,
      create: (params) => new DeepSeekChatModel({ ...params, clientOptions }),
    },
    {
      name: GeminiChatModel.name,
      provider: providers.google,
      create: (params) => new GeminiChatModel({ ...params, clientOptions }),
    },
    {
      name: OllamaChatModel.name,
      provider: providers.ollama,
      create: (params) => new OllamaChatModel({ ...params, clientOptions }),
    },
    {
      name: OpenRouterChatModel.name,
      provider: providers.openRouter,
      create: (params) => new OpenRouterChatModel({ ...params, clientOptions }),
    },
    {
      name: XAIChatModel.name,
      provider: providers.xai,
      create: (params) => new XAIChatModel({ ...params, clientOptions }),
    },
  ];
}

const currentApiKeyIndex: { [key in AIProvider]?: number } = {};
const apiKeys: { [key in AIProvider]: () => string[] } = {
  google: () => Config.geminiApiKey,
  openai: () => Config.openaiApiKey,
  openRouter: () => Config.openRouterApiKey,
  anthropic: () => Config.anthropicApiKey,
  deepseek: () => Config.deepseekApiKey,
  bedrock: () => Config.awsAccessKeyId,
  ollama: () => Config.ollamaApiKey,
  xai: () => Config.xaiApiKey,
};

function getAIApiKey(company: AIProvider) {
  currentApiKeyIndex[company] ??= 0;

  const index = currentApiKeyIndex[company]!++;
  const keys = apiKeys[company]?.();

  const key = keys?.[index % keys.length];

  if (!key) throw new SubscriptionError(SubscriptionErrorType.UNSUBSCRIBED);

  return { apiKey: key };
}

function getBedrockConfig() {
  currentApiKeyIndex.bedrock ??= 0;

  const index = currentApiKeyIndex.bedrock!++;
  const accessKeyIds = Config.awsAccessKeyId;
  const secretAccessKeys = Config.awsSecretAccessKey;
  const regions = Config.awsRegion;

  const accessKeyId = accessKeyIds?.[index % accessKeyIds.length];
  const secretAccessKey = secretAccessKeys?.[index % secretAccessKeys.length];
  const region = regions?.[index % regions.length];

  if (!accessKeyId || !secretAccessKey || !region) {
    throw new SubscriptionError(SubscriptionErrorType.UNSUBSCRIBED);
  }

  return { accessKeyId, secretAccessKey, region };
}

const BASE_URL_CONFIG_MAP = {
  openai: () => Config.openaiBaseURL,
  anthropic: () => Config.anthropicBaseURL,
  ollama: () => Config.ollamaBaseURL,
} as const;

export function loadModel(
  model: string,
  {
    provider,
    modelOptions,
    clientOptions,
  }: {
    provider?: string;
    modelOptions?: ChatModelOptions;
    clientOptions?: OpenAIChatModelOptions['clientOptions'];
  } = {}
) {
  const models = availableModels();
  const m = models.find((m) => provider && m.provider.toLowerCase().includes(provider.toLowerCase()));

  if (!m) throw new Error(`Provider ${provider} model ${model} not found, Please check the model name and provider.`);

  let params: {
    apiKey?: string;
    baseURL?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
    modelOptions?: ChatModelOptions;
    clientOptions?: OpenAIChatModelOptions['clientOptions'];
  };

  if (m.provider === 'bedrock') {
    params = getBedrockConfig();
  } else {
    params = getAIApiKey(m.provider);
  }

  const baseURLGetter = BASE_URL_CONFIG_MAP[m.provider as keyof typeof BASE_URL_CONFIG_MAP];
  if (baseURLGetter) {
    const baseURL = baseURLGetter();

    if (baseURL) {
      params.baseURL = baseURL;
    }
  }

  if (modelOptions) {
    params.modelOptions = modelOptions;
  }

  if (clientOptions) {
    params.clientOptions = clientOptions;
  }

  return m.create({ ...params, model });
}

export const getModel = (
  input: ChatCompletionInput & Required<Pick<ChatCompletionInput, 'model'>>,
  options?: {
    modelOptions?: ChatModelOptions;
    clientOptions?: OpenAIChatModelOptions['clientOptions'];
  }
) => {
  const modelArray = input.model.split('/');
  const [providerName, name] = [modelArray[0], modelArray.slice(1).join('/')];

  const getDefaultProvider = () => {
    if (input.model.startsWith('gemini')) return 'google';
    if (input.model.startsWith('gpt')) return 'openai';
    if (input.model.startsWith('openRouter')) return 'openRouter';

    if (!providerName || !name) {
      throw new Error(
        'The model format is incorrect. Please use {provider}/{model}, for example: openai/gpt-4o or anthropic/claude-3-5-sonnet'
      );
    }

    return '';
  };

  const [provider, model] = providerName && name ? [providerName, name] : [getDefaultProvider(), input.model];
  if (!model) throw new Error(`Provider ${provider} model ${input.model} not found`);

  const m = loadModel(model, { provider, ...options });
  return m;
};

export async function chatCompletionByFrameworkModel(
  input: ChatCompletionInput & Required<Pick<ChatCompletionInput, 'model'>>
): Promise<AsyncGenerator<ChatCompletionResponse>> {
  const model = getModel(input);

  const response = await model.invoke(
    {
      messages: convertToFrameworkMessages(input.messages),
      responseFormat: input.responseFormat?.type === 'json_schema' ? input.responseFormat : { type: 'text' },
      toolChoice: input.toolChoice,
      tools: input.tools,
      modelOptions: pick(input, ['temperature', 'topP', 'presencePenalty', 'frequencyPenalty', 'maxTokens']),
    },
    { streaming: true }
  );

  return adaptStreamToOldFormat(response);
}

export async function* adaptStreamToOldFormat(
  stream: AgentResponseStream<ChatModelOutput>
): AsyncGenerator<ChatCompletionResponse> {
  const toolCalls: ChatCompletionChunk['delta']['toolCalls'] = [];
  const role: ChatCompletionChunk['delta']['role'] = 'assistant';

  for await (const chunk of stream) {
    if (isAgentResponseDelta(chunk)) {
      const { delta } = chunk;

      if (delta.json?.toolCalls && Array.isArray(delta.json.toolCalls)) {
        for (const call of delta.json.toolCalls) {
          toolCalls.push(call);
        }
      }

      if (delta.text?.text || delta.json?.toolCalls) {
        yield {
          delta: {
            role,
            content: delta.text?.text,
            toolCalls: toolCalls.length > 0 ? [...toolCalls] : [],
          },
        };
      }

      if (delta.json?.usage) {
        const { inputTokens = 0, outputTokens = 0 } =
          (delta.json.usage as { inputTokens: number; outputTokens: number }) || {};

        yield {
          usage: {
            promptTokens: inputTokens,
            completionTokens: outputTokens,
            totalTokens: inputTokens + outputTokens,
          },
        };
      }
    }
  }
}
