import env from '@blocklet/sdk/lib/env';

export default {
  ...env,
  chainHost: process.env.CHAIN_HOST || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
};
