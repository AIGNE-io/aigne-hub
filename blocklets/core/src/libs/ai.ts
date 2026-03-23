import { createImageGenerationApi, createStatusApi, createTextCompletionApi } from '@blocklet/aigne-hub/api';
import { createFetch } from '@blocklet/js-sdk';

import axios, { API_TIMEOUT, STREAM_API_TIMEOUT } from './api';

export type { ImageGenerationSize } from '@blocklet/aigne-hub/api/ai-kit';

export const getAIStatus = createStatusApi({ axios, path: '/api/v1/status' });

export const textCompletions = createTextCompletionApi({
  fetch: createFetch() as typeof fetch,
  path: '/api/v1/completions',
  timeout: API_TIMEOUT,
  headers: {
    'x-aigne-hub-client-did': window.blocklet?.appPid,
  },
});

export const textCompletionsV2 = createTextCompletionApi({
  fetch: createFetch() as typeof fetch,
  path: '/api/v2/completions',
  timeout: STREAM_API_TIMEOUT,
  headers: {
    'x-aigne-hub-client-did': window.blocklet?.appPid,
  },
});

export const imageGenerations = createImageGenerationApi({ axios, path: '/api/v1/image/generations' });

// Function for /image endpoint with correct payload structure
export const imageGenerationsV2Image = async (input: {
  prompt: string;
  size?: string;
  n?: number;
  response_format?: string;
  model: string;
}) => {
  const response = await axios.post(
    '/api/v2/image',
    {
      agent: input.model, // Use model as agent name
      input: {
        prompt: input.prompt,
        size: input.size,
        n: input.n || 1,
        responseFormat: input.response_format || 'b64_json',
        outputFileType: 'url',
        modelOptions: { model: input.model },
      },
    },
    {
      headers: { 'x-aigne-hub-client-did': window.blocklet?.appPid },
      timeout: 5 * 60 * 1000, // 5 minutes timeout for image generation
    }
  );

  return response.data;
};

export const videoGenerationsV2 = async (input: { prompt: string; model: string }) => {
  const response = await axios.post(
    '/api/v2/video',
    {
      agent: input.model, // Use model as agent name
      input: {
        prompt: input.prompt,
        model: input.model,
        outputFileType: 'url',
        modelOptions: { model: input.model },
      },
    },
    {
      headers: { 'x-aigne-hub-client-did': window.blocklet?.appPid },
      timeout: 10 * 60 * 1000,
    }
  );

  return response.data;
};

// Gemini native API — transparent proxy to Google's Gemini format
export const geminiStreamCompletion = async (
  model: string,
  messages: Array<{ role: string; content: string }>
): Promise<ReadableStream> => {
  // Strip provider prefix (e.g. "google/gemini-3-flash-preview" → "gemini-3-flash-preview")
  const modelName = model.includes('/') ? model.split('/').slice(1).join('/') : model;

  const geminiContents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const response = await fetch(`/api/v2/models/${modelName}:streamGenerateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: geminiContents,
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${err}`);
  }

  // Parse SSE stream → extract text from Gemini format
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async pull(controller) {
      let buffer = '';
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                controller.enqueue(text);
              }
            } catch {
              // ignore
            }
          }
        }
      }
    },
  });
};

// Embeddings API using /api/v2/embeddings endpoint
export const embeddingsV2Direct = async (
  input: string | Array<string>,
  model: string
): Promise<{ data: { embedding: number[] }[] }> => {
  const response = await axios.post(
    '/api/v2/embeddings',
    {
      model,
      input,
    },
    {
      headers: { 'x-aigne-hub-client-did': window.blocklet?.appPid },
      timeout: 30 * 1000, // 30 second timeout
    }
  );

  return response.data;
};
