import { AgentResponseStream, ChatModelOutput, Message, isAgentResponseDelta } from '@aigne/core';
import { ChatCompletionChunk, ChatCompletionInput, ChatCompletionResponse } from '@blocklet/aigne-hub/api/types';
import { CustomError } from '@blocklet/error';

export async function convertToFrameworkMessages(
  messages: ChatCompletionInput['messages']
): Promise<import('@aigne/core').ChatModelInputMessage[]> {
  return Promise.all(
    messages.map(async (message): Promise<import('@aigne/core').ChatModelInputMessage> => {
      switch (message.role) {
        case 'system':
          return {
            role: 'system' as const,
            content: message.content,
          };

        case 'user':
          return {
            role: 'user' as const,
            content: message.content as string,
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
    })
  );
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
