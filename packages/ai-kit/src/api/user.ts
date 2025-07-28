import { User } from '@arcblock/ux/lib/type';
import { formatError } from '@blocklet/error';
import type { TPaymentCurrency } from '@blocklet/payment-js';
import axios from 'axios';
import { joinURL } from 'ufo';

import { getPrefix, getRemoteBaseUrl } from './utils/util';

export interface UserInfoResult {
  user: User;
  enableCredit: boolean;
  creditBalance: {
    balance: string;
    total: string;
    grantCount: number;
    pendingCredit: string;
  } | null;
  paymentLink: string | null;
  currency?: TPaymentCurrency;
  profileLink: string;
}

export async function getUserInfo({
  baseUrl,
  accessKey,
}: {
  baseUrl: string;
  accessKey: string;
}): Promise<UserInfoResult>;
export async function getUserInfo({
  baseUrl,
  accessKey,
}: {
  baseUrl?: string;
  accessKey: string;
}): Promise<UserInfoResult> {
  let finalBaseUrl = getPrefix();
  try {
    if (baseUrl) {
      const tmp = new URL(baseUrl);
      if (tmp.origin !== window.location.origin) {
        finalBaseUrl = await getRemoteBaseUrl(baseUrl);
      }
    }
  } catch (err) {
    console.warn('Failed to parse baseUrl:', err);
    throw new Error(`Failed to parse baseUrl: ${formatError(err)}`);
  }

  return axios
    .get(joinURL(finalBaseUrl, '/api/user/info'), {
      headers: {
        Authorization: `Bearer ${accessKey}`,
      },
    })
    .then((res) => res.data);
}
