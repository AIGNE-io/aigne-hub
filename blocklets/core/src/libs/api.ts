import axios from 'axios';

export const PREFIX = window.blocklet?.prefix || '/';

export const API_TIMEOUT = 30 * 1000;
export const STREAM_API_TIMEOUT = 10 * 60 * 1000;

const api = axios.create({
  baseURL: PREFIX,
  timeout: API_TIMEOUT,
});

export default api;
