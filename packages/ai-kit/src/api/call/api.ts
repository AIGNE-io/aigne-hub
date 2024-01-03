import axios from 'axios';

import { AI_KIT_BASE_URL } from '../constants';

const aiKitApi = axios.create({
  baseURL: AI_KIT_BASE_URL,
});

export default aiKitApi;
