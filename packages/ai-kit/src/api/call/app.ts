import type { IncomingMessage } from 'http';

import { TSubscriptionExpanded } from '@blocklet/payment-js';
import { call } from '@blocklet/sdk/lib/component';
import { AxiosResponse } from 'axios';

import AIKitConfig from '../config';
import { getRemoteComponentCallHeaders } from '../utils/auth';
import { aiKitApi, catchAndRethrowUpstreamError } from './api';

export interface AppStatusResult {
  id: string;
  subscription?: TSubscriptionExpanded;
}

export async function appStatus(
  { description }: { description?: string },
  options?: { useAIKitService?: boolean; responseType?: undefined }
): Promise<AppStatusResult | null>;
export async function appStatus(
  { description }: { description?: string },
  options: {
    useAIKitService?: boolean;
    responseType: 'stream';
  }
): Promise<AxiosResponse<IncomingMessage, any>>;
export async function appStatus(
  { description }: { description?: string },
  {
    useAIKitService = AIKitConfig.useAIKitService,
    ...options
  }: { useAIKitService?: boolean; responseType?: 'stream' } = {}
): Promise<AppStatusResult | null | AxiosResponse<IncomingMessage, any>> {
  const response = await catchAndRethrowUpstreamError(
    useAIKitService
      ? aiKitApi.get('/api/app/status', {
          params: { description },
          responseType: options.responseType,
          headers: { ...getRemoteComponentCallHeaders({}) },
        })
      : call({
          name: 'ai-kit',
          method: 'GET',
          path: '/api/app/status',
          params: { description },
          data: {},
          responseType: options?.responseType!,
        })
  );

  if (options?.responseType === 'stream') return response;

  return response.data;
}

export interface RegisterPayload {
  publicKey: string;
}

export interface RegisterResult {
  appId: string;
  paymentLink?: string;
}

export async function appRegister(
  payload: RegisterPayload,
  options?: { useAIKitService?: boolean; responseType?: undefined }
): Promise<RegisterResult>;
export async function appRegister(
  payload: RegisterPayload,
  options: {
    useAIKitService?: boolean;
    responseType: 'stream';
  }
): Promise<AxiosResponse<IncomingMessage, any>>;
export async function appRegister(
  payload: RegisterPayload,
  {
    useAIKitService = AIKitConfig.useAIKitService,
    ...options
  }: { useAIKitService?: boolean; responseType?: 'stream' } = {}
): Promise<RegisterResult | AxiosResponse<IncomingMessage, any>> {
  const response = await catchAndRethrowUpstreamError(
    useAIKitService
      ? aiKitApi.post('/api/app/register', payload, { responseType: options.responseType })
      : call({
          name: 'ai-kit',
          method: 'GET',
          path: '/api/app/register',
          data: payload,
          responseType: options?.responseType!,
        })
  );

  if (options?.responseType === 'stream') return response;

  return response.data;
}

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
