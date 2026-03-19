import axios from 'axios';

export function createAxios(options: Record<string, unknown> = {}) {
  return axios.create({
    timeout: 30000,
    ...options,
  });
}

export function createFetch() {
  return fetch;
}

export function getBlockletSDK() {
  return {
    createAxios,
    createFetch,
    config: {
      appId: '',
      appName: 'AIGNE Hub',
      prefix: '/',
    },
  };
}

export default { createAxios, createFetch, getBlockletSDK };
