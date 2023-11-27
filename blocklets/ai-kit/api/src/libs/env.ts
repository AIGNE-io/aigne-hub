import config from '@blocklet/sdk/lib/config';
import Joi from 'joi';

import logger from './logger';

export const Config = {
  _verbose: undefined as boolean | undefined,
  get verbose() {
    if (this._verbose === undefined) {
      this._verbose = Joi.boolean().validate(process.env.VERBOSE).value ?? false;
    }
    return this._verbose;
  },

  _openaiApiKey: undefined as string[] | undefined,
  get openaiApiKey() {
    if (this._openaiApiKey === undefined) {
      const KEY = config.env.OPENAI_API_KEY;

      this._openaiApiKey = (typeof KEY === 'string' ? KEY : '')
        .split(',')
        .map((i: string) => i.trim())
        .filter(Boolean);
    }
    return this._openaiApiKey;
  },

  _httpsProxy: undefined as string | undefined,
  get httpsProxy() {
    if (this._httpsProxy === undefined) {
      this._httpsProxy = config.env.HTTPS_PROXY || config.env.https_proxy || '';
    }
    return this._httpsProxy;
  },

  _maxRetries: undefined as number | undefined,
  get maxRetries() {
    if (this._maxRetries === undefined) {
      const { value, error } = Joi.number<number>()
        .integer()
        .min(1)
        .max(100)
        .validate(config.env.preferences.MAX_RETRIES);
      if (error) logger.error('validate preferences.MAX_RETRIES error', error);
      this._maxRetries = (value as number) || 1;
    }
    return this._maxRetries;
  },

  get dataDir() {
    return config.env.dataDir;
  },
};

config.events.on(config.Events.envUpdate, () => {
  for (const key of Object.keys(Config)) {
    if (key.startsWith('_')) {
      delete (Config as any)[key];
    }
  }
});
