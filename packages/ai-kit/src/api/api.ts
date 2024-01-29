import axios from 'axios';

export const PREFIX = window.blocklet?.componentMountPoints.find((i) => i.name === 'ai-kit')?.mountPoint || '/';

export const API_TIMEOUT = 30 * 1000;

const api = axios.create({
  baseURL: PREFIX,
  timeout: API_TIMEOUT,
});

export default api;
