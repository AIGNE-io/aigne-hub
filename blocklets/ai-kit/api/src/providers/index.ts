import { ReadableStream } from 'stream/web';

export interface ChatCompletionInput {
  model: string;
  messages: (
    | {
        role: 'system';
        content: string | null;
      }
    | {
        role: 'user';
        content: string | ({ type: 'text'; text: string } | { type: 'image_url'; imageUrl: { url: string } })[] | null;
      }
    | {
        role: 'assistant';
        content: string | null;
        toolCalls?: {
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }[];
      }
    | {
        role: 'tool';
        content: string | null;
        toolCallId: string;
      }
  )[];
  temperature?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  maxTokens?: number;
  tools?: {
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters: Record<string, any>;
    };
  }[];
}

export interface ChatCompletionChunk {
  delta?: {
    role?: 'system' | 'user' | 'assistant' | 'tool';
    content?: string | null;
    toolCalls?: {
      id?: string;
      type?: 'function';
      function?: {
        name?: string;
        arguments?: string;
      };
    }[];
  };
  error?: {
    message: string;
  };
}

export interface ChatCompletionStream extends ReadableStream<ChatCompletionChunk> {}

export interface ChatProvider {
  (input: ChatCompletionInput): Promise<ChatCompletionStream>;
}
