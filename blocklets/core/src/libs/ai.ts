import { createImageGenerationApi, createStatusApi, createTextCompletionApi } from '@blocklet/aigne-hub/api/ai-kit';
import { createFetch } from '@blocklet/js-sdk';

import axios, { API_TIMEOUT } from './api';

export type { ImageGenerationSize } from '@blocklet/aigne-hub/api/ai-kit';

export const getAIStatus = createStatusApi({ axios, path: '/api/v1/status' });

export const textCompletions = createTextCompletionApi({
  fetch: createFetch(),
  path: '/api/v1/completions',
  timeout: API_TIMEOUT,
});

export const textCompletionsV2 = createTextCompletionApi({
  fetch: createFetch(),
  path: '/api/v2/completions',
  timeout: API_TIMEOUT,
});

export const imageGenerations = createImageGenerationApi({ axios, path: '/api/v1/image/generations' });

export const imageGenerationsV2 = createImageGenerationApi({ axios, path: '/api/v2/image/generations' });
