import type { Agent } from 'node:https';

import { AnthropicChatModel } from '@aigne/anthropic';
import { BedrockChatModel } from '@aigne/bedrock';
import { AgentResponseStream, ChatModel, ChatModelOptions, ChatModelOutput } from '@aigne/core';
import { DeepSeekChatModel } from '@aigne/deepseek';
import { GeminiChatModel } from '@aigne/gemini';
import { OllamaChatModel } from '@aigne/ollama';
import { OpenRouterChatModel } from '@aigne/open-router';
import { OpenAIChatModel } from '@aigne/openai';
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
          // @ts-ignore
          toolCalls: (message.toolCalls || [])?.map((call) => ({
            id: call.id,
            type: 'function' as const,
            function: {
              name: call.function.name,
              arguments: call.function.arguments,
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

type AIProvider = 'openai' | 'anthropic' | 'bedrock' | 'deepseek' | 'google' | 'ollama' | 'openRouter' | 'xai';

export function availableModels(): {
  name: string;
  provider: AIProvider;
  model: string;
  create: (options: { model?: string; modelOptions?: ChatModelOptions }) => ChatModel;
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
      provider: 'openai',
      model: 'gpt',
      create: (params) => new OpenAIChatModel({ ...params, clientOptions }),
    },
    {
      name: AnthropicChatModel.name,
      provider: 'anthropic',
      model: 'claude',
      create: (params) => new AnthropicChatModel({ ...params, clientOptions }),
    },
    {
      name: BedrockChatModel.name,
      provider: 'bedrock',
      model: 'amazon',
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
      provider: 'deepseek',
      model: 'deepseek',
      create: (params) => new DeepSeekChatModel({ ...params, clientOptions }),
    },
    {
      name: GeminiChatModel.name,
      provider: 'google',
      model: 'gemini',
      create: (params) => new GeminiChatModel({ ...params, clientOptions }),
    },
    {
      name: OllamaChatModel.name,
      provider: 'ollama',
      model: 'llama3',
      create: (params) => new OllamaChatModel({ ...params, clientOptions }),
    },
    {
      name: OpenRouterChatModel.name,
      provider: 'openRouter',
      model: 'openRouter',
      create: (params) => new OpenRouterChatModel({ ...params, clientOptions }),
    },
    {
      name: XAIChatModel.name,
      provider: 'xai',
      model: 'grok',
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

export function getAIApiKey(company: AIProvider) {
  currentApiKeyIndex[company] ??= 0;

  const index = currentApiKeyIndex[company]!++;
  const keys = apiKeys[company]?.();

  const key = keys?.[index % keys.length];

  if (!key) throw new SubscriptionError(SubscriptionErrorType.UNSUBSCRIBED);

  return { apiKey: key };
}

export function getBedrockCredentials() {
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

export function loadModel(model: string, { provider }: { provider?: string } = {}) {
  const models = availableModels();
  const m = models.find(
    (m) =>
      (provider && m.provider.toLowerCase().includes(provider.toLowerCase())) ||
      m.model.toLowerCase().includes(model.toLowerCase())
  );

  if (!m) throw new Error(`Model ${model} not found`);

  let params: { apiKey?: string; baseURL?: string; accessKeyId?: string; secretAccessKey?: string; region?: string };

  if (m.provider === 'bedrock') {
    params = getBedrockCredentials();
  } else {
    params = getAIApiKey(m.provider);
  }

  if (provider === 'openai') {
    const { openaiBaseURL } = Config;
    params.baseURL = openaiBaseURL || undefined;
  }

  if (provider === 'anthropic') {
    const { anthropicBaseURL } = Config;
    params.baseURL = anthropicBaseURL || undefined;
  }

  if (provider === 'ollama') {
    const { ollamaBaseURL } = Config;
    params.baseURL = ollamaBaseURL || undefined;
  }

  return m.create({ ...params, model });
}

export const getModel = (input: ChatCompletionInput & Required<Pick<ChatCompletionInput, 'model'>>) => {
  const getDefaultProvider = () => {
    if (input.model.startsWith('gemini')) return 'google';
    if (input.model.startsWith('gpt')) return 'openai';
    if (input.model.startsWith('openRouter')) return 'openRouter';

    if (input.model.split('/').length === 1) {
      throw new Error(
        'The model format is incorrect. Please use {provider}/{model}, for example: openai/gpt-4o or anthropic/claude-3-5-sonnet-20240620'
      );
    }

    return '';
  };

  const modelArray = input.model.split('/');
  const [provider, model] =
    modelArray.length > 1 ? [modelArray[0], modelArray.slice(1).join('/')] : [getDefaultProvider(), input.model];
  if (!model) throw new Error('Model is required, Please check your model name');
  const m = loadModel(model, { provider });
  return m;
};

export async function chatCompletionByFrameworkModel(
  input: ChatCompletionInput & Required<Pick<ChatCompletionInput, 'model'>>
): Promise<AsyncGenerator<ChatCompletionResponse>> {
  const m = getModel(input);

  const stream = await m.invoke(
    {
      messages: convertToFrameworkMessages(input.messages),
      responseFormat: input.responseFormat?.type === 'json_schema' ? input.responseFormat : { type: 'text' },
      toolChoice: input.toolChoice,
      tools: input.tools,
      modelOptions: pick(input, ['temperature', 'topP', 'presencePenalty', 'frequencyPenalty', 'maxTokens']),
    },
    { streaming: input.stream }
  );

  return adaptStreamToOldFormat(stream as any);
}

export async function* adaptStreamToOldFormat(
  stream: ReadableStream<AgentResponseStream<ChatModelOutput>>
): AsyncGenerator<ChatCompletionResponse> {
  const reader = stream.getReader();

  const toolCalls: ChatCompletionChunk['delta']['toolCalls'] = [];
  const role: ChatCompletionChunk['delta']['role'] = 'assistant';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const { delta } = value as any;

    if (delta.json?.toolCalls) {
      for (const call of delta.json.toolCalls) {
        toolCalls.push(call);
      }
    }

    if (delta.text?.text || delta.json?.toolCalls) {
      yield {
        delta: {
          role,
          content: delta.text?.text,
          toolCalls: toolCalls.length ? [...toolCalls] : [],
        },
      };
    }

    if (delta.json?.usage) {
      yield {
        usage: {
          promptTokens: delta.json.usage.inputTokens ?? 0,
          completionTokens: delta.json.usage.outputTokens ?? 0,
          totalTokens: (delta.json.usage.inputTokens ?? 0) + (delta.json.usage.outputTokens ?? 0),
        },
      };
    }
  }
}
