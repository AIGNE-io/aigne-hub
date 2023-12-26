import { TSubscriptionExpanded } from '@did-pay/client';

import { getRemoteComponentCallHeaders } from '../utils/auth';
import aiKitApi from './api';

export interface AppStatusResult {
  id: string;
  subscription?: TSubscriptionExpanded;
}

export async function appStatus(): Promise<AppStatusResult | null> {
  return aiKitApi.get('/api/app/status', { headers: getRemoteComponentCallHeaders({}) }).then((res) => res.data);
}

export interface AppRegisterPayload {
  publicKey: string;
}

export interface AppRegisterResult {
  appId: string;
  paymentLink?: string;
}

export async function appRegister(payload: AppRegisterPayload): Promise<AppRegisterResult> {
  return aiKitApi.post('/api/app/register', payload).then((res) => res.data);
}
