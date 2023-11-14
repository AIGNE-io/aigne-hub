import env from '@blocklet/sdk/lib/env';
import Joi from 'joi';

export default {
  ...env,
  chainHost: process.env.CHAIN_HOST || '',
  openaiApiKey: (process.env.OPENAI_API_KEY || '')
    .split(',')
    .map((i) => i.trim())
    .filter(Boolean),
  verbose: Joi.boolean().validate(process.env.VERBOSE).value ?? false,
  httpsProxy: process.env.HTTPS_PROXY || process.env.https_proxy || '',
};
