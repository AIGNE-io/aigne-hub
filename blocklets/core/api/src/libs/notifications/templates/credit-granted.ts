import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { fromUnitToToken } from '@ocap/util';

import logger from '../../logger';
import { ensureCustomer, ensureMeter, getCreditUsageLink, paymentClient } from '../../payment';
import { formatTime, getUserLocale } from '../shared';
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
      'notification.creditGranted.welcomeTitle': 'Welcome to AIGNE Hub!',
      'notification.creditGranted.welcomeBody':
        'Your account is now active with {grantedAmount} in credits. Start using AI services now! Credits expire {expiresAt}.',
      'notification.creditGranted.welcomeBodyNoExpire':
        'Your account is now active with {grantedAmount} in credits. Start using AI services anytime!',

      'notification.creditGranted.title': 'Credits Added',
      'notification.creditGranted.body':
        '{grantedAmount} in credits have been added to your account. Valid until {expiresAt}.',
      'notification.creditGranted.bodyNoExpire': '{grantedAmount} in credits have been added to your account.',

      'notification.creditGranted.grantedCredit': 'Amount',
      'notification.creditGranted.validUntil': 'Valid Until',
      'notification.creditGranted.neverExpires': 'Never Expires',
      'notification.common.account': 'Account',
      'notification.common.viewCreditGrant': 'View Credits',
      'notification.common.aiServicesHint': 'Use credits to access AI services',
    },
    zh: {
      'notification.creditGranted.welcomeTitle': '欢迎使用 AIGNE Hub！',
      'notification.creditGranted.welcomeBody':
        '您的账户已激活，现有 {grantedAmount} Credits。立即开始使用 AI 服务！Credits 有效期至 {expiresAt}',
      'notification.creditGranted.welcomeBodyNoExpire':
        '您的账户已激活，现有 {grantedAmount} Credits。随时开始使用 AI 服务！',

      'notification.creditGranted.title': 'Credits 已添加',
      'notification.creditGranted.body': '已向您的账户添加 {grantedAmount} Credits，有效期至 {expiresAt}',
      'notification.creditGranted.bodyNoExpire': '已向您的账户添加 {grantedAmount} Credits',

      'notification.creditGranted.grantedCredit': '金额',
      'notification.creditGranted.validUntil': '有效期至',
      'notification.creditGranted.neverExpires': '永不过期',
      'notification.common.account': '账户',
      'notification.common.viewCreditGrant': '查看 Credits',
      'notification.common.aiServicesHint': '使用 Credits 访问 AI 服务',
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
    logger.error('Failed to check existing credit grants for welcome credit detection', {
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
          link: getCreditUsageLink(userDid),
        },
      ],
    };

    return template;
  }
}
