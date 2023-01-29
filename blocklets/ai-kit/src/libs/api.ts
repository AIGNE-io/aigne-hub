import axios from 'axios';

export const PREFIX = window.blocklet?.prefix || '/';

const api = axios.create({
  baseURL: PREFIX,
  timeout: 200 * 1000,
});

export default api;
