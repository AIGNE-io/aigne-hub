import { IncomingMessage } from 'http';
import { Readable } from 'stream';
import { ReadableStream } from 'stream/web';

import { ChatCompletionChunk, ChatCompletionInput } from '@blocklet/ai-kit/api/types';
import { GenerateContentResponse } from '@google/generative-ai';
import axios from 'axios';
import { customAlphabet } from 'nanoid';

export async function* geminiChatCompletion(
  input: ChatCompletionInput & Required<Pick<ChatCompletionInput, 'model'>>,
  config: { apiKey: string }
): AsyncGenerator<ChatCompletionChunk> {
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

  const stream = readFromReader(res.data);

  for await (const chunk of stream) {
    const choice = chunk.candidates?.[0];
    if (choice?.content.parts) {
      yield {
        delta: {
          role: 'assistant',
          content: choice.content.parts
            .map((i) => i.text)
            .filter(Boolean)
            .join('\n'),
          toolCalls: choice.content.parts
            // FIXME: GenerateContentResponse not include functionCall property yet.
            .filter((i: any) => typeof i.functionCall === 'object')
            .map((i: any) => ({
              id: randomId(),
              type: 'function',
              function: {
                name: i.functionCall.name,
                arguments: JSON.stringify(i.functionCall.args),
              },
            })),
        },
      };
    } else if (chunk.promptFeedback?.blockReason) {
      const { blockReason, blockReasonMessage } = chunk.promptFeedback;

      throw new Error(['PROMPT_BLOCKED', blockReason, blockReasonMessage].filter(Boolean).join(' '));
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

const responseLineRE = /^data: (.*)\r\n/;

function readFromReader(reader: Readable) {
  return new ReadableStream<GenerateContentResponse>({
    async start(controller) {
      try {
        let currentText = '';
        const decoder = new TextDecoder();

        for await (const value of reader) {
          const chunk = decoder.decode(value, { stream: true });
          currentText += chunk;
          const match = currentText.match(responseLineRE);
          if (match) {
            let parsedResponse;
            try {
              parsedResponse = JSON.parse(match[1]!);
            } catch (e) {
              throw new Error(`Error parsing JSON response: "${match[1]}"`);
            }
            currentText = '';
            controller.enqueue(parsedResponse);
          }
        }

        if (currentText) {
          let message: string | undefined;

          try {
            const json = JSON.parse(currentText);
            message = json.error?.message;
          } catch (error) {
            throw new Error(`Error parsing JSON response: "${currentText}"`);
          }

          if (typeof message === 'string') throw new Error(message);
        }
      } catch (error) {
        controller.error(error);
      } finally {
        controller.close();
      }
    },
  });
}

const randomId = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
