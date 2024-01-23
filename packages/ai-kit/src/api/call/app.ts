import type { IncomingMessage } from 'http';

import { call } from '@blocklet/sdk/lib/component';
import { AxiosResponse } from 'axios';

import AIKitConfig from '../config';
import { getRemoteComponentCallHeaders } from '../utils/auth';
import aiKitApi, { catchAndRethrowUpstreamError } from './api';

export async function unsubscribe(options?: { useAIKitService?: boolean; responseType?: undefined }): Promise<null>;
export async function unsubscribe(options: {
  useAIKitService?: boolean;
  responseType: 'stream';
}): Promise<AxiosResponse<IncomingMessage, any>>;
export async function unsubscribe({
  useAIKitService = AIKitConfig.useAIKitService,
  ...options
}: { useAIKitService?: boolean; responseType?: 'stream' } = {}): Promise<null | AxiosResponse<IncomingMessage, any>> {
  const response = await catchAndRethrowUpstreamError(
    useAIKitService
      ? aiKitApi.post(
          '/api/app/unsubscribe',
          {},
          {
            responseType: options.responseType,
            headers: { ...getRemoteComponentCallHeaders({}) },
          }
        )
      : call({
          name: 'ai-kit',
          path: '/api/app/unsubscribe',
          data: {},
          responseType: options?.responseType!,
        })
  );

  if (options?.responseType === 'stream') return response;

  return response.data;
}
