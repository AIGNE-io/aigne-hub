import { AgentResponseStream, ChatModelOutput, Message, isAgentResponseDelta } from '@aigne/core';
import { getModelNameWithProvider } from '@api/libs/ai-provider';
import AiProvider from '@api/store/models/ai-provider';
import { ChatCompletionChunk, ChatCompletionInput, ChatCompletionResponse } from '@blocklet/aigne-hub/api/types';
import { CustomError } from '@blocklet/error';

export function convertToFrameworkMessages(
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
                    return { type: 'url', url: item.imageUrl.url };
                  }
                  return item;
                }),
        };

      case 'assistant':
        return {
          role: 'agent' as const,
          content: message.content,
          toolCalls: message.toolCalls?.map((call) => ({
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
        throw new CustomError(400, `Unknown message role: ${message.role}`);
    }
  });
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

      if (delta.json?.json) {
        yield {
          delta: {
            role,
            content: JSON.stringify(delta.json.json),
          },
        };
      }

      if (delta.text?.text || delta.json?.toolCalls) {
        yield {
          delta: {
            role,
            content: delta.text?.text,
            toolCalls:
              Array.isArray(toolCalls) && toolCalls.length > 0
                ? toolCalls.map((call) => ({
                    ...call,
                    function: {
                      name: call.function?.name,
                      arguments:
                        call.function?.arguments && typeof call.function.arguments === 'object'
                          ? JSON.stringify(call.function.arguments)
                          : call.function?.arguments,
                    },
                  }))
                : [],
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

export async function getModelAndProviderId(model: string) {
  let { providerName, modelName } = getModelNameWithProvider(model);

  const getDefaultProvider = () => {
    if (model.toLowerCase().startsWith('gemini')) return 'google';
    if (model.toLowerCase().startsWith('gpt')) return 'openai';
    if (model.toLowerCase().startsWith('openrouter')) return 'openrouter';
    if (model.toLowerCase().startsWith('dall-e')) return 'openai';

    if (!providerName || !modelName) {
      throw new CustomError(
        400,
        'The model format is incorrect. Please use {provider}/{model}, for example: openai/gpt-4o or anthropic/claude-3-5-sonnet'
      );
    }

    return '';
  };

  if (!providerName) {
    providerName = getDefaultProvider();
    modelName = model;
  }

  const provider = await AiProvider.findOne({ where: { name: providerName } });
  return { providerId: provider?.id || '', modelName, providerName };
}
