import { createImageGenerationApi, createStatusApi, createTextCompletionApi } from '@blocklet/ai-kit/api/ai-kit';

import axios, { API_TIMEOUT } from './api';

export type { ImageGenerationSize } from '@blocklet/ai-kit/api/ai-kit';

export const getAIStatus = createStatusApi({ axios, path: '/api/v1/status' });

export const textCompletions = createTextCompletionApi({ axios, path: '/api/v1/completions', timeout: API_TIMEOUT });

export const imageGenerations = createImageGenerationApi({ axios, path: '/api/v1/image/generations' });
