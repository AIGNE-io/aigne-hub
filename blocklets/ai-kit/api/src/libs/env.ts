import Usage from '@api/store/models/usage';
import config from '@blocklet/sdk/lib/config';
import Joi from 'joi';

import logger from './logger';

export const isDevelopment = config.env.mode === 'development';

export const PAYMENT_DID = 'z2qaCNvKMv5GjouKdcDWexv6WqtHbpNPQDnAk';

export const METER_NAME = 'agent-hub-ai-meter';

export const METER_UNIT = 'AIC';

export const DEFAULT_CREDIT_PRICE_KEY = 'DEFAULT_CREDIT_UNIT_PRICE';

type Pricing = {
  creditPaymentLink: string;
  creditBasedBillingEnabled: boolean;
  subscriptionPaymentLink: string;
  newUserCreditGrantEnabled: boolean;
  newUserCreditGrantAmount: number;
  creditExpirationDays: number;
  subscriptionProductId: string;
  basePricePerUnit: number;
  onlyEnableModelsInPricing?: boolean;
  list: { type: NonNullable<Usage['type']>; model: string; inputRate: number; outputRate: number }[];
};

export const Config = {
  get appDir() {
    return process.env.BLOCKLET_APP_DIR!;
  },

  _verbose: undefined as boolean | undefined,
  get verbose() {
    if (this._verbose === undefined) {
      this._verbose = Joi.boolean().validate(config.env.VERBOSE).value ?? false;
    }
    return this._verbose;
  },

  _aiKitBaseURL: undefined as string | undefined,
  get aiKitBaseURL() {
    if (this._aiKitBaseURL === undefined) {
      this._aiKitBaseURL = config.env.AI_KIT_BASE_URL;
    }
    return this._aiKitBaseURL;
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

  _aiKitApiKey: undefined as string[] | undefined,
  get aiKitApiKey() {
    if (this._aiKitApiKey === undefined) {
      const KEY = config.env.AI_KIT_API_KEY;
      this._aiKitApiKey = (typeof KEY === 'string' ? KEY : '')
        .split(',')
        .map((i: string) => i.trim())
        .filter(Boolean);
    }

    return this._aiKitApiKey;
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
      if (error) logger.error('validate preferences.MAX_RETRIES error', { error });

      this._maxRetries = (value as number) || 1;
    }
    return this._maxRetries;
  },

  _baseCreditBilling: undefined as boolean | undefined,
  get baseCreditBilling() {
    if (this._baseCreditBilling === undefined) {
      this._baseCreditBilling = config.env.preferences.baseCreditBilling ?? false;
    }
    return this._baseCreditBilling;
  },

  _creditPaymentLink: undefined as string | undefined,
  get creditPaymentLink() {
    if (this._creditPaymentLink === undefined) {
      this._creditPaymentLink = config.env.preferences.creditPaymentLink;
    }
    return this._creditPaymentLink;
  },

  _creditBasedBillingEnabled: undefined as boolean | undefined,
  get creditBasedBillingEnabled() {
    if (this._creditBasedBillingEnabled === undefined) {
      this._creditBasedBillingEnabled = config.env.preferences?.creditBasedBillingEnabled ?? false;
    }
    return this._creditBasedBillingEnabled;
  },

  _newUserCreditGrantEnabled: undefined as boolean | undefined,
  get newUserCreditGrantEnabled() {
    if (this._newUserCreditGrantEnabled === undefined) {
      this._newUserCreditGrantEnabled = config.env.preferences.newUserCreditGrantEnabled ?? false;
    }
    return this._newUserCreditGrantEnabled;
  },

  _newUserCreditGrantAmount: undefined as number | undefined,
  get newUserCreditGrantAmount() {
    if (this._newUserCreditGrantAmount === undefined) {
      this._newUserCreditGrantAmount = config.env.preferences.newUserCreditGrantAmount ?? 100;
    }
    return this._newUserCreditGrantAmount;
  },

  _creditExpirationDays: undefined as number | undefined,
  get creditExpirationDays() {
    if (this._creditExpirationDays === undefined) {
      this._creditExpirationDays = config.env.preferences.creditExpirationDays ?? 0;
    }
    return this._creditExpirationDays;
  },

  _pricing: undefined as Pricing | undefined | null,
  get pricing() {
    if (this._pricing === undefined) {
      const res = Joi.object<Pricing>({
        subscriptionPaymentLink: Joi.string().optional(),
        subscriptionProductId: Joi.string().optional(),
        basePricePerUnit: Joi.number().min(0).optional(),
        onlyEnableModelsInPricing: Joi.boolean().empty([null, '']),
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
          onlyEnableModelsInPricing: config.env.preferences.onlyEnableModelsInPricing,
          list: config.env.preferences.pricingList,
        },
        { stripUnknown: true }
      );
      if (res.error) {
        logger.error('validate preferences.MAX_RETRIES error', { error: res.error });
        this._pricing = null;
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
