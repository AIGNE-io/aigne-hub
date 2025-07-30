import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { fromUnitToToken } from '@ocap/util';

import logger from '../../logger';
import { ensureCustomer, ensureMeter, paymentClient } from '../../payment';
import { formatTime, getCustomerIndexUrl, getUserLocale } from '../shared';
import {
  BaseNotificationTemplate,
  BaseNotificationTemplateContext,
  BaseNotificationTemplateOptions,
  BaseNotificationTemplateType,
} from './base';

export interface CreditGrantedNotificationTemplateOptions extends BaseNotificationTemplateOptions {
  creditGrantId: string;
  creditGrant?: any;
}

export interface CreditGrantedNotificationTemplateContext extends BaseNotificationTemplateContext {
  currencySymbol: string;
  grantedAmount: string;
  expiresAt?: string;
  neverExpires: boolean;
  isWelcomeCredit: boolean;
}

function translate(key: string, locale: string, params?: Record<string, any>): string {
  const translations = {
    en: {
      'notification.creditGranted.welcomeTitle': 'Welcome to AIGNE Hub! Your AI credits are ready',
      'notification.creditGranted.welcomeBody':
        'Your AIGNE Hub account has been activated with {grantedAmount} in credits. Use them to access our AI services until {expiresAt}. Start exploring now!',
      'notification.creditGranted.welcomeBodyNoExpire':
        'Your AIGNE Hub account has been activated with {grantedAmount} in credits. Use them to access our AI services anytime.',

      'notification.creditGranted.title': 'Your AIGNE Hub account has been credited',
      'notification.creditGranted.body':
        'Your AIGNE Hub account has received {grantedAmount} in credits. Use them to call AI services until {expiresAt}.',
      'notification.creditGranted.bodyNoExpire':
        'Your AIGNE Hub account has received {grantedAmount} in credits. Use them to call AI services anytime.',

      'notification.creditGranted.grantedCredit': 'Credit Amount',
      'notification.creditGranted.validUntil': 'Valid until',
      'notification.creditGranted.neverExpires': 'No expiration',
      'notification.common.account': 'Account',
      'notification.common.viewCreditGrant': 'View Credits',
      'notification.common.aiServicesHint': 'Use credits to access all AIGNE Hub AI services',
    },
    zh: {
      'notification.creditGranted.welcomeTitle': '欢迎来到 AIGNE Hub！AI额度已激活',
      'notification.creditGranted.welcomeBody':
        '您的 AIGNE Hub 账户已激活 {grantedAmount} 额度，可用于调用平台所有AI服务至 {expiresAt}。立即体验！',
      'notification.creditGranted.welcomeBodyNoExpire':
        '您的 AIGNE Hub 账户已激活 {grantedAmount} 额度，可随时调用平台AI服务。',

      'notification.creditGranted.title': '您的 AIGNE Hub 账户额度已更新',
      'notification.creditGranted.body':
        '您的 AIGNE Hub 账户已获得 {grantedAmount} 额度，有效期至 {expiresAt}，可用于所有AI服务调用。',
      'notification.creditGranted.bodyNoExpire':
        '您的 AIGNE Hub 账户已获得 {grantedAmount} 额度，可随时用于AI服务调用。',

      'notification.creditGranted.grantedCredit': '额度',
      'notification.creditGranted.validUntil': '有效期至',
      'notification.creditGranted.neverExpires': '永久有效',
      'notification.common.account': '账户',
      'notification.common.viewCreditGrant': '查看额度',
      'notification.common.aiServicesHint': '额度可用于调用 AIGNE Hub 平台所有AI服务',
    },
  };

  const localeTranslations = translations[locale as keyof typeof translations] || translations.en;
  let text = localeTranslations[key as keyof typeof localeTranslations] || key;

  if (params) {
    Object.keys(params).forEach((param) => {
      text = text.replace(new RegExp(`{${param}}`, 'g'), params[param]);
    });
  }

  return text;
}

async function isWelcomeCredit(creditGrant: any, userDid: string): Promise<boolean> {
  if (creditGrant.metadata?.welcomeCredit === true) {
    logger.info('Welcome credit detected via metadata flag', {
      userDid,
      creditGrantId: creditGrant.id,
    });
    return true;
  }

  try {
    const existingCreditGrants = await paymentClient.creditGrants.list({
      customer_id: userDid,
      currency_id: creditGrant.currency_id,
    });

    if (existingCreditGrants.list.length === 1 && creditGrant.type === 'promotional') {
      logger.info('Welcome credit detected via first promotional grant', {
        userDid,
        creditGrantId: creditGrant.id,
        totalGrants: existingCreditGrants.list.length,
        grantType: creditGrant.type,
      });
      return true;
    }

    logger.info('Credit grant is not a welcome credit', {
      userDid,
      creditGrantId: creditGrant.id,
      totalGrants: existingCreditGrants.list.length,
      grantType: creditGrant.type,
      hasMetadata: !!creditGrant.metadata?.welcomeCredit,
    });
  } catch (error) {
    logger.warn('Failed to check existing credit grants for welcome credit detection', {
      error,
      userDid,
      creditGrantId: creditGrant.id,
    });
  }

  return false;
}

export class CreditGrantedNotificationTemplate extends BaseNotificationTemplate<
  CreditGrantedNotificationTemplateContext,
  CreditGrantedNotificationTemplateOptions
> {
  async getContext(): Promise<CreditGrantedNotificationTemplateContext> {
    if (!this.options.creditGrantId) {
      throw new Error('creditGrantId is required');
    }

    const { creditGrant } = this.options;
    if (!creditGrant) {
      throw new Error('CreditGrant data is required');
    }

    const customer = await ensureCustomer(creditGrant.customer_id);
    if (!customer) {
      throw new Error(`Customer not found: ${creditGrant.customer_id}`);
    }

    const paymentCurrency = await paymentClient.paymentCurrencies.retrieve(creditGrant.currency_id);
    if (!paymentCurrency) {
      throw new Error('paymentCurrency not found');
    }

    const meter = await ensureMeter();
    if (!meter) {
      throw new Error('meter not found');
    }
    if (paymentCurrency.id !== meter.currency_id) {
      throw new Error('Currency mismatch, skipping send');
    }

    const userDid = customer.did;
    const locale = await getUserLocale(userDid);
    const currencySymbol = paymentCurrency.symbol;

    const neverExpires = !creditGrant.expires_at;
    const expiresAt = creditGrant.expires_at ? formatTime(new Date(creditGrant.expires_at * 1000)) : undefined;

    // 判断是否为欢迎授信
    const isWelcomeCreditFlag = await isWelcomeCredit(creditGrant, userDid);

    return {
      locale,
      userDid,
      currencySymbol,
      grantedAmount: `${formatNumber(fromUnitToToken(creditGrant.amount.toString(), paymentCurrency.decimal))} ${currencySymbol}`,
      expiresAt,
      neverExpires,
      isWelcomeCredit: isWelcomeCreditFlag,
    };
  }

  async getTemplate(): Promise<BaseNotificationTemplateType> {
    const context = await this.getContext();
    const { locale, userDid, grantedAmount, expiresAt, neverExpires, isWelcomeCredit } = context;

    const titleKey = isWelcomeCredit ? 'notification.creditGranted.welcomeTitle' : 'notification.creditGranted.title';
    const bodyKey = isWelcomeCredit
      ? neverExpires
        ? 'notification.creditGranted.welcomeBodyNoExpire'
        : 'notification.creditGranted.welcomeBody'
      : neverExpires
        ? 'notification.creditGranted.bodyNoExpire'
        : 'notification.creditGranted.body';

    const fields = [
      {
        type: 'text',
        data: {
          type: 'plain',
          color: '#9397A1',
          text: translate('notification.common.account', locale),
        },
      },
      {
        type: 'text',
        data: {
          type: 'plain',
          text: userDid,
        },
      },
      {
        type: 'text',
        data: {
          type: 'plain',
          color: '#9397A1',
          text: translate('notification.creditGranted.grantedCredit', locale),
        },
      },
      {
        type: 'text',
        data: {
          type: 'plain',
          text: grantedAmount,
        },
      },
      {
        type: 'text',
        data: {
          type: 'plain',
          color: '#9397A1',
          text: translate('notification.creditGranted.validUntil', locale),
        },
      },
      {
        type: 'text',
        data: {
          type: 'plain',
          text: neverExpires ? translate('notification.creditGranted.neverExpires', locale) : (expiresAt as string),
        },
      },
    ];

    const template: BaseNotificationTemplateType = {
      title: translate(titleKey, locale, isWelcomeCredit ? {} : { grantedAmount }),
      body: neverExpires
        ? translate(bodyKey, locale, { grantedAmount })
        : translate(bodyKey, locale, { grantedAmount, expiresAt }),
      attachments: [
        {
          type: 'section',
          fields,
        },
      ],
      actions: [
        {
          name: translate('notification.common.viewCreditGrant', locale),
          title: translate('notification.common.viewCreditGrant', locale),
          link: getCustomerIndexUrl({ locale, userDid }),
        },
      ],
    };

    return template;
  }
}
