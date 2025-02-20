import { IncomingMessage } from 'http';
import { TextDecoderStream } from 'stream/web';

import { ChatCompletionChunk, ChatCompletionInput, ChatCompletionResponse } from '@blocklet/ai-kit/api/types';
import { EventSourceParserStream, readableToWeb } from '@blocklet/ai-kit/api/utils/event-stream';
import { GenerateContentResponse } from '@google/generative-ai';
import axios from 'axios';
import { customAlphabet } from 'nanoid';

export async function* geminiChatCompletion(
  input: ChatCompletionInput & Required<Pick<ChatCompletionInput, 'model'>>,
  config: { apiKey: string }
): AsyncGenerator<ChatCompletionResponse> {
  const body = {
    contents: contentsFromMessages(input.messages),
    generationConfig: {
      temperature: input.temperature,
      maxOutputTokens: input.maxTokens,
      topP: input.topP,
    },
    tools:
      input.tools && input.tools.length > 0
        ? [
            {
              function_declarations: input.tools.map((i) => ({
                name: i.function.name,
                description: i.function.description,
                parameters: i.function.parameters,
              })),
            },
          ]
        : undefined,
  };

  const res = await axios<IncomingMessage>({
    url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent?key=${config.apiKey}&alt=sse`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    responseType: 'stream',
    validateStatus: () => true,
  });

  const stream = readableToWeb(res.data)
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream<GenerateContentResponse>());

  const toolCalls: ChatCompletionChunk['delta']['toolCalls'] = [];

  for await (const chunk of stream) {
    const choice = chunk.candidates?.[0];
    if (choice?.content?.parts) {
      const calls = choice.content.parts
        .map((part) => {
          if (part.functionCall) {
            return {
              id: randomId(),
              type: 'function' as const,
              function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args),
              },
            };
          }

          return undefined;
        })
        .filter((i): i is NonNullable<typeof i> => !!i);

      if (calls.length) {
        toolCalls.push(...calls);
      }

      yield {
        delta: {
          role: 'assistant',
          content: choice.content.parts
            .map((i) => i.text)
            .filter(Boolean)
            .join('\n'),
          toolCalls,
        },
      };
    }

    if (chunk.promptFeedback?.blockReason) {
      const { blockReason, blockReasonMessage } = chunk.promptFeedback;

      throw new Error(['PROMPT_BLOCKED', blockReason, blockReasonMessage].filter(Boolean).join(' '));
    }

    if (chunk.usageMetadata) {
      yield {
        usage: {
          promptTokens: chunk.usageMetadata.promptTokenCount,
          completionTokens: chunk.usageMetadata.candidatesTokenCount,
          totalTokens: chunk.usageMetadata.totalTokenCount,
        },
      };
    }
  }
}

function contentsFromMessages([...messages]: ChatCompletionInput['messages']) {
  const contents = [];

  let prevMsg: { role: 'user' | 'model'; parts: { text: string }[] } | undefined;

  while (messages.length) {
    const message = messages.shift()!;

    if (!prevMsg || message.role !== prevMsg.role) {
      prevMsg = { role: message.role === 'assistant' ? 'model' : 'user', parts: [] };
      contents.push(prevMsg);
    }

    if (typeof message.content === 'string') {
      prevMsg.parts.push({ text: message.content });
    } else if (Array.isArray(message.content)) {
      prevMsg.parts.push(
        ...message.content
          .map((i) => ({ text: i.type === 'text' ? i.text : undefined }))
          .filter((i): i is { text: string } => !!i.text)
      );
    }
  }

  if (contents[0]?.role !== 'user') {
    contents.unshift({ role: 'user', parts: [{ text: ' ' }] });
  }
  if (contents.at(-1)?.role !== 'user') {
    contents.push({ role: 'user', parts: [{ text: ' ' }] });
  }

  return contents;
}

const randomId = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
