import { TSubscriptionExpanded } from '@blocklet/payment-js';

import api from './api';

export interface AppStatusResult {
  id: string;
  subscription?: TSubscriptionExpanded;
  config?: AIKitServiceConfig | null;
}

export async function appStatus(): Promise<AppStatusResult> {
  return Promise.all([api.get('/api/app/service/status'), appConfig()]).then(([res, config]) => ({
    ...res.data,
    config,
  }));
}

export interface AIKitServiceConfig {
  useAIKitService?: boolean;
}

export async function appConfig(): Promise<AIKitServiceConfig | null> {
  return api.get('/api/app/config').then((res) => res.data);
}

export async function setAppConfig(payload: AIKitServiceConfig): Promise<AIKitServiceConfig> {
  return api.patch('/api/app/config', payload).then((res) => res.data);
}

export interface AppRegisterResult {
  appId: string;
  paymentLink?: string;
}

export async function appServiceRegister(): Promise<AppRegisterResult> {
  return api.post('/api/app/service/register').then((res) => res.data);
}

export interface AppUsedCreditsResult {
  model: string;
  date: string;
  usedCredits: string;
  promptTokens: number;
  completionTokens: number;
  numberOfImageGeneration: number;
}

export async function appUsedCredits(
  query: { startTime?: string; endTime: string },
  options?: { useAIKitService?: boolean }
): Promise<{ list: AppUsedCreditsResult[] }> {
  return api
    .get(options?.useAIKitService ? '/api/app/service/usage' : '/api/app/usage', { params: query })
    .then((res) => res.data);
}

export async function unsubscribe(): Promise<void> {
  return api.post('/api/app/service/unsubscribe');
}
