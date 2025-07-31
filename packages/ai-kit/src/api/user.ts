import { formatError } from '@blocklet/error';
import axios from 'axios';
import { joinURL } from 'ufo';

import { UserInfoResult } from './types/user';
import { getPrefix, getRemoteBaseUrl } from './utils/util';

export async function getUserInfo({
  baseUrl,
  accessKey,
}: {
  baseUrl: string;
  accessKey: string;
}): Promise<UserInfoResult>;
export async function getUserInfo({
  baseUrl = '',
  accessKey = '',
}: {
  baseUrl?: string;
  accessKey: string;
}): Promise<UserInfoResult> {
  let finalBaseUrl = getPrefix();
  const windowExist = typeof window !== 'undefined';
  try {
    if (baseUrl) {
      const tmp = new URL(baseUrl);
      if (!windowExist || (windowExist && tmp.origin !== window.location.origin)) {
        finalBaseUrl = await getRemoteBaseUrl(baseUrl);
      }
    }
  } catch (err) {
    console.warn('Failed to parse baseUrl:', err);
    throw new Error(`Failed to parse baseUrl: ${formatError(err)}`);
  }
  if (!finalBaseUrl || !accessKey) {
    throw new Error('baseUrl or accessKey is not set');
  }

  return axios
    .get(joinURL(finalBaseUrl, '/api/user/info'), {
      headers: {
        Authorization: `Bearer ${accessKey}`,
      },
    })
    .then((res) => res.data);
}
