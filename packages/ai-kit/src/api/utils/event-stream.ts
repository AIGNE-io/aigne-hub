import { Readable } from 'stream';
import { ReadableStream, TextDecoderStream, TransformStream } from 'stream/web';

import { logger } from '@blocklet/sdk/lib/config';
import { createParser } from 'eventsource-parser';

import { ChatCompletionResponse } from '../types';

export function readableToWeb(readable: Readable) {
  return new ReadableStream({
    async start(controller) {
      for await (const chunk of readable) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

export class EventSourceParserStream extends TransformStream<any, ChatCompletionResponse> {
  constructor() {
    let parser: ReturnType<typeof createParser> | undefined;

    super({
      start(controller) {
        parser = createParser((event) => {
          if (event.type === 'event') {
            try {
              const json = JSON.parse(event.data) as ChatCompletionResponse;
              controller.enqueue(json);
            } catch (error) {
              console.error('parse chunk error', error, event.data);
            }
          }
        });
      },
      transform(chunk) {
        parser?.feed(chunk);
      },
    });
  }
}

export async function tryParseJsonFromResponseStream<T>(data: Readable): Promise<T | undefined> {
  let text = '';
  let json;

  try {
    for await (const chunk of readableToWeb(data).pipeThrough(new TextDecoderStream())) {
      text += chunk;
    }
    json = JSON.parse(text);
  } catch (error) {
    logger.error('parse json from response error', text, error);
  }

  return json;
}
