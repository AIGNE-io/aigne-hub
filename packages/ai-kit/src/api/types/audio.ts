import type { ReadStream } from 'fs';
import type { Readable } from 'stream';
import type { ReadableStream } from 'stream/web';

export interface AudioTranscriptionsInput {
  file: Buffer | ReadStream | Readable | ReadableStream;
  model: string;
  language?: string;
  prompt?: string;
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
  temperature?: number;
}

export interface AudioSpeechInput {
  model: string;
  input: string;
  voice: string;
  responseFormat?: 'mp3' | 'opus' | 'aac' | 'and' | 'flac';
  speed?: 0.25 | 4.0 | 1.0;
}
