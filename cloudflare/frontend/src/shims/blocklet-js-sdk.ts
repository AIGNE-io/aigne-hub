import axios from 'axios';

const API_KEY_STORAGE = 'aigne_api_key';

export function createAxios(options: Record<string, unknown> = {}) {
  const instance = axios.create({
    timeout: 30000,
    ...options,
  });

  // Auto-attach API Key
  instance.interceptors.request.use((config) => {
    const key = localStorage.getItem(API_KEY_STORAGE);
    if (key && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${key}`;
    }
    return config;
  });

  return instance;
}

export function createFetch() {
  // Wrap fetch to auto-attach API Key
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const key = localStorage.getItem(API_KEY_STORAGE);
    if (key) {
      const headers = new Headers(init?.headers);
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${key}`);
      }
      return fetch(input, { ...init, headers });
    }
    return fetch(input, init);
  };
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
