import type { IncomingMessage } from 'http';

import { call } from '@blocklet/sdk/lib/component';
import { AxiosResponse } from 'axios';

import AIKitConfig from '../config';
import { getRemoteComponentCallHeaders } from '../utils/auth';
import aiKitApi, { catchAndRethrowUpstreamError } from './api';

export async function cancelSubscription(options?: {
  useAIKitService?: boolean;
  responseType?: undefined;
}): Promise<null>;
export async function cancelSubscription(options: {
  useAIKitService?: boolean;
  responseType: 'stream';
}): Promise<AxiosResponse<IncomingMessage, any>>;
export async function cancelSubscription({
  useAIKitService = AIKitConfig.useAIKitService,
  ...options
}: { useAIKitService?: boolean; responseType?: 'stream' } = {}): Promise<null | AxiosResponse<IncomingMessage, any>> {
  const response = await catchAndRethrowUpstreamError(
    useAIKitService
      ? aiKitApi.post(
          '/api/app/subscription/cancel',
          {},
          {
            responseType: options.responseType,
            headers: { ...getRemoteComponentCallHeaders({}) },
          }
        )
      : call({
          name: 'ai-kit',
          path: '/api/app/subscription/cancel',
          data: {},
          responseType: options?.responseType!,
        })
  );

  if (options?.responseType === 'stream') return response;

  return response.data;
}

export async function recoverSubscription(options?: {
  useAIKitService?: boolean;
  responseType?: undefined;
}): Promise<null>;
export async function recoverSubscription(options: {
  useAIKitService?: boolean;
  responseType: 'stream';
}): Promise<AxiosResponse<IncomingMessage, any>>;
export async function recoverSubscription({
  useAIKitService = AIKitConfig.useAIKitService,
  ...options
}: { useAIKitService?: boolean; responseType?: 'stream' } = {}): Promise<null | AxiosResponse<IncomingMessage, any>> {
  const response = await catchAndRethrowUpstreamError(
    useAIKitService
      ? aiKitApi.post(
          '/api/app/subscription/recover',
          {},
          {
            responseType: options.responseType,
            headers: { ...getRemoteComponentCallHeaders({}) },
          }
        )
      : call({
          name: 'ai-kit',
          path: '/api/app/subscription/recover',
          data: {},
          responseType: options?.responseType!,
        })
  );

  if (options?.responseType === 'stream') return response;

  return response.data;
}
