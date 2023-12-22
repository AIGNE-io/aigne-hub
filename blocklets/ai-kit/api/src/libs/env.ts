import Usage from '@api/store/models/usage';
import config from '@blocklet/sdk/lib/config';
import Joi from 'joi';

import logger from './logger';

type Pricing = {
  subscriptionPaymentLink: string;
  subscriptionProductId: string;
  basePricePerUnit: number;
  list: { type: NonNullable<Usage['type']>; model: string; inputRate: number; outputRate: number }[];
};

export const Config = {
  _verbose: undefined as boolean | undefined,
  get verbose() {
    if (this._verbose === undefined) {
      this._verbose = Joi.boolean().validate(config.env.VERBOSE).value ?? false;
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

  _geminiApiKey: undefined as string[] | undefined,
  get geminiApiKey() {
    if (this._geminiApiKey === undefined) {
      const KEY = config.env.GEMINI_API_KEY;

      this._geminiApiKey = (typeof KEY === 'string' ? KEY : '')
        .split(',')
        .map((i: string) => i.trim())
        .filter(Boolean);
    }
    return this._geminiApiKey;
  },

  _openRouterApiKey: undefined as string[] | undefined,
  get openRouterApiKey() {
    if (this._openRouterApiKey === undefined) {
      const KEY = config.env.OPEN_ROUTER_API_KEY;

      this._openRouterApiKey = (typeof KEY === 'string' ? KEY : '')
        .split(',')
        .map((i: string) => i.trim())
        .filter(Boolean);
    }
    return this._openRouterApiKey;
  },

  get openaiBaseURL() {
    const url = config.env.OPENAI_BASE_URL;
    return url && typeof url === 'string' ? url : undefined;
  },

  get httpsProxy() {
    const proxy = config.env.HTTPS_PROXY;
    return proxy && typeof proxy === 'string' ? proxy : undefined;
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

  _pricing: undefined as Pricing | undefined,
  get pricing() {
    if (this._pricing === undefined) {
      const res = Joi.object<Pricing>({
        subscriptionPaymentLink: Joi.string().required(),
        subscriptionProductId: Joi.string().required(),
        basePricePerUnit: Joi.number().min(0).required(),
        list: Joi.array().items(
          Joi.object({
            type: Joi.string().valid('chatCompletion', 'embedding', 'imageGeneration').required(),
            model: Joi.string().required(),
            inputRate: Joi.number().min(0).required(),
            outputRate: Joi.number().min(0).required(),
          })
        ),
      }).validate(
        {
          subscriptionPaymentLink: config.env.preferences.subscriptionPaymentLink,
          subscriptionProductId: config.env.preferences.subscriptionProductId,
          basePricePerUnit: config.env.preferences.basePricePerUnit,
          list: config.env.preferences.pricingList,
        },
        { stripUnknown: true }
      );
      if (res.error) {
        logger.error('validate preferences.MAX_RETRIES error', res.error);
      } else {
        this._pricing = res.value;
      }
    }

    return this._pricing;
  },

  get usageReportThrottleTime() {
    return 600e3;
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
