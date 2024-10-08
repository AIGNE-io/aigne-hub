export interface ChatCompletionInput {
  stream?: boolean;
  model?: string;
  messages: (
    | {
        role: 'system';
        content: string;
      }
    | {
        role: 'user';
        content: string | ({ type: 'text'; text: string } | { type: 'image_url'; imageUrl: { url: string } })[];
      }
    | {
        role: 'assistant';
        content: string;
        toolCalls?: {
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }[];
      }
    | {
        role: 'tool';
        content: string;
        toolCallId: string;
      }
  )[];
  temperature?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  maxTokens?: number;
  toolChoice?:
    | 'auto'
    | 'none'
    | 'required'
    | {
        type: 'function';
        function: {
          name: string;
          description?: string;
        };
      };
  tools?: {
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters: Record<string, any>;
    };
  }[];
  responseFormat?:
    | {
        type?: 'text' | 'json_object';
      }
    | {
        type: 'json_schema';
        jsonSchema: {
          name: string;
          description?: string;
          schema: Record<string, any>;
          strict?: boolean;
        };
      };
}

export type ChatCompletionResponse = ChatCompletionChunk | ChatCompletionError | ChatCompletionUsage;

export interface ChatCompletionChunk {
  delta: {
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
}

export interface ChatCompletionError {
  error: {
    message: string;
    type?: string;
    timestamp?: string;
  };
}

export interface ChatCompletionUsage {
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export function isChatCompletionChunk(data: ChatCompletionResponse): data is ChatCompletionChunk {
  return typeof (data as ChatCompletionChunk).delta === 'object';
}

export function isChatCompletionUsage(data: ChatCompletionResponse): data is ChatCompletionUsage {
  return typeof (data as ChatCompletionUsage).usage === 'object';
}

export function isChatCompletionError(data: ChatCompletionResponse): data is ChatCompletionError {
  return typeof (data as ChatCompletionError).error === 'object';
}
