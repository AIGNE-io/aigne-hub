import { Readable } from 'stream';
import { ReadableStream, TextDecoderStream, TransformStream } from 'stream/web';

import { createParser } from 'eventsource-parser';

import logger from '../../libs/logger';

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

export class EventSourceParserStream<T> extends TransformStream<any, T> {
  constructor() {
    let parser: ReturnType<typeof createParser> | undefined;

    super({
      start(controller) {
        parser = createParser((event) => {
          if (event.type === 'event') {
            try {
              const json = JSON.parse(event.data) as T;
              controller.enqueue(json);
            } catch (error) {
              logger.error('parse chunk error', error, event.data);
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
