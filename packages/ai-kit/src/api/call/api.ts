import axios, { isAxiosError } from 'axios';

import { AI_KIT_BASE_URL } from '../constants';
import { tryParseJsonFromResponseStream } from '../utils/event-stream';

export const aiKitApi = axios.create({
  baseURL: AI_KIT_BASE_URL,
});

export async function catchAndRethrowUpstreamError(response: Promise<any>) {
  return response.catch(async (error) => {
    if (isAxiosError(error) && error.response?.data) {
      const { data } = error.response;
      const json =
        typeof data[Symbol.iterator] === 'function'
          ? await tryParseJsonFromResponseStream<{ error: { message: string } }>(data)
          : data;
      const message = json?.error?.message;
      if (typeof message === 'string') throw new Error(message);
    }
    throw error;
  });
}
