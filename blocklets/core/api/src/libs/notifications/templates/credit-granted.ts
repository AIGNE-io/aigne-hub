import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { fromUnitToToken } from '@ocap/util';

import { Config } from '../../env';
import logger from '../../logger';
import {
  ensureCustomer,
  ensureMeter,
  getCreditUsageLink,
  getPaymentKitPrefix,
  getPlaygroundLink,
  paymentClient,
} from '../../payment';
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
  isPurchase: boolean;
  paymentAmount?: string;
  invoiceUrl?: string;
}

function translate(key: string, locale: string, params?: Record<string, any>): string {
  const translations = {
    en: {
      'notification.creditGranted.welcomeTitle': 'AIGNE Hub: Your AI experience credits are activated',
      'notification.creditGranted.welcomeBody':
        'Your AIGNE Hub account has been granted {grantedAmount} in experience credits, available until {expiresAt} for the entire AIGNE ecosystem, including DocSmith, WebSmith, and every AI application.\nAIGNE Hub is the AI service center for the AIGNE ecosystem, powering all applications with models, generation, and content processing capabilities.\nTry now!',
      'notification.creditGranted.welcomeBodyNoExpire':
        'Your AIGNE Hub account has been granted {grantedAmount} in experience credits, available for the entire AIGNE ecosystem, including DocSmith, WebSmith, and every AI application.\nAIGNE Hub is the AI service center for the AIGNE ecosystem, powering all applications with models, generation, and content processing capabilities.\nTry now!',

      'notification.creditGranted.purchaseBody':
        "Your payment was successful. We've added {grantedAmount} to your balance, available until {expiresAt}.\nYou can use these credits immediately to use LLMs, process content, and build with DocSmith, WebSmith, and all AIGNE Hub applications.",
      'notification.creditGranted.purchaseBodyNoExpire':
        "Your payment was successful. We've added {grantedAmount} to your balance.\nYou can use these credits immediately to use LLMs, process content, and build with DocSmith, WebSmith, and all AIGNE Hub applications.",

      'notification.creditGranted.title': 'AIGNE Hub: Your AI credits are now active',
      'notification.creditGranted.body':
        "We've added {grantedAmount} to your account, available until {expiresAt}.\nYou can use these credits to use LLMs, process content, and build with DocSmith, WebSmith, and all AIGNE Hub applications.",
      'notification.creditGranted.bodyNoExpire':
        "We've added {grantedAmount} to your account.\nYou can use these credits to use LLMs, process content, and build with DocSmith, WebSmith, and all AIGNE Hub applications.",

      'notification.creditGranted.grantedCredit': 'Credit Amount',
      'notification.creditGranted.validUntil': 'Valid until',
      'notification.creditGranted.neverExpires': 'No expiration',
      'notification.creditGranted.paymentAmount': 'Payment Amount',
      'notification.creditGranted.invoiceId': 'Invoice ID',
      'notification.common.account': 'Account',
      'notification.common.viewCreditGrant': 'View Credits',
      'notification.common.viewInvoice': 'View Invoice',
      'notification.common.tryNow': 'Try Now',
    },
    zh: {
      'notification.creditGranted.welcomeTitle': 'AIGNE Hub：您的 AI 体验额度已激活',
      'notification.creditGranted.welcomeBody':
        '您的 AIGNE Hub 账户已获得 {grantedAmount} 体验额度，可在 {expiresAt} 前用于 AIGNE 全系应用（如 DocSmith、WebSmith）的所有 AI 功能。\nAIGNE Hub 是 AIGNE 生态系统的统一 AI 服务中心，为所有 AIGNE 应用提供模型、生成与内容处理等 AI 能力。\n立即体验！',
      'notification.creditGranted.welcomeBodyNoExpire':
        '您的 AIGNE Hub 账户已获得 {grantedAmount} 体验额度，可用于 AIGNE 全系应用（如 DocSmith、WebSmith）的所有 AI 功能。\nAIGNE Hub 是 AIGNE 生态系统的统一 AI 服务中心，为所有 AIGNE 应用提供模型、生成与内容处理等 AI 能力。\n立即体验！',

      'notification.creditGranted.purchaseBody':
        '支付成功！您的账户已到账 {grantedAmount}，可在 {expiresAt} 前用于 AIGNE 全系应用（如 DocSmith、WebSmith）的所有 AI 功能。',
      'notification.creditGranted.purchaseBodyNoExpire':
        '支付成功！您的账户已到账 {grantedAmount}，可用于 AIGNE 全系应用（如 DocSmith、WebSmith）的所有 AI 功能。',

      'notification.creditGranted.title': 'AIGNE Hub：您的 AI 额度已到账',
      'notification.creditGranted.body':
        '您的账户已到账 {grantedAmount}，可在 {expiresAt} 前用于 AIGNE 全系应用（如 DocSmith、WebSmith）的所有 AI 功能。',
      'notification.creditGranted.bodyNoExpire':
        '您的账户已到账 {grantedAmount}，可用于 AIGNE 全系应用（如 DocSmith、WebSmith）的所有 AI 功能。',

      'notification.creditGranted.grantedCredit': '额度',
      'notification.creditGranted.validUntil': '有效期至',
      'notification.creditGranted.neverExpires': '永久有效',
      'notification.creditGranted.paymentAmount': '支付金额',
      'notification.creditGranted.invoiceId': '账单 ID',
      'notification.common.account': '账户',
      'notification.common.viewCreditGrant': '查看额度',
      'notification.common.viewInvoice': '查看账单',
      'notification.common.tryNow': '立即体验',
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

    const invoiceIdFromMetadata = creditGrant.metadata?.invoice_id;
    let paymentAmount: string | undefined;
    let invoiceUrl: string | undefined;
    let isPurchase = false;

    if (invoiceIdFromMetadata) {
      try {
        const invoice = await paymentClient.invoices.retrieve(invoiceIdFromMetadata);
        if (invoice) {
          isPurchase = true;
          const invoiceCurrency = invoice.paymentCurrency || paymentCurrency;
          const invoiceSymbol = invoiceCurrency?.symbol || currencySymbol;
          const invoiceDecimal = invoiceCurrency?.decimal ?? paymentCurrency.decimal;
          if (invoice.amount_paid) {
            paymentAmount = `${formatNumber(fromUnitToToken(invoice.amount_paid || '0', invoiceDecimal))} ${invoiceSymbol}`;
          }
          invoiceUrl = invoice.id ? `${getPaymentKitPrefix()}/customer/invoice/${invoice.id}` : undefined;
        }
      } catch (error) {
        logger.error('Failed to retrieve invoice for credit grant notification', {
          error,
          invoiceId: invoiceIdFromMetadata,
          creditGrantId: creditGrant.id,
        });
      }
    }

    const isWelcomeCreditFlag = !isPurchase && (await isWelcomeCredit(creditGrant, userDid));

    return {
      locale,
      userDid,
      currencySymbol,
      grantedAmount: `${formatNumber(fromUnitToToken(creditGrant.amount.toString(), paymentCurrency.decimal))} ${currencySymbol}`,
      expiresAt,
      neverExpires,
      isWelcomeCredit: isWelcomeCreditFlag,
      isPurchase,
      paymentAmount,
      invoiceUrl,
    };
  }

  async getTemplate(): Promise<BaseNotificationTemplateType> {
    const context = await this.getContext();
    const {
      locale,
      userDid,
      grantedAmount,
      expiresAt,
      neverExpires,
      isWelcomeCredit,
      isPurchase,
      paymentAmount,
      invoiceUrl,
    } = context;

    let titleKey = 'notification.creditGranted.title';
    let bodyKey = neverExpires ? 'notification.creditGranted.bodyNoExpire' : 'notification.creditGranted.body';

    if (isWelcomeCredit) {
      titleKey = 'notification.creditGranted.welcomeTitle';
      bodyKey = neverExpires
        ? 'notification.creditGranted.welcomeBodyNoExpire'
        : 'notification.creditGranted.welcomeBody';
    } else if (isPurchase) {
      // Use same title as general case, but different body to emphasize payment
      bodyKey = neverExpires
        ? 'notification.creditGranted.purchaseBodyNoExpire'
        : 'notification.creditGranted.purchaseBody';
    }

    const titleParams: Record<string, string> = {};
    if (!isWelcomeCredit) {
      titleParams.grantedAmount = grantedAmount;
    }
    const bodyParams: Record<string, string> = { grantedAmount };
    if (!neverExpires && expiresAt) {
      bodyParams.expiresAt = expiresAt;
    }

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

    if (isPurchase && paymentAmount) {
      fields.push(
        {
          type: 'text',
          data: {
            type: 'plain',
            color: '#9397A1',
            text: translate('notification.creditGranted.paymentAmount', locale),
          },
        },
        {
          type: 'text',
          data: {
            type: 'plain',
            text: paymentAmount,
          },
        }
      );
    }

    const actions = [];

    // Add playground action if enabled
    if (Config.guestPlaygroundEnabled) {
      actions.push({
        name: translate('notification.common.tryNow', locale),
        title: translate('notification.common.tryNow', locale),
        link: getPlaygroundLink(userDid),
      });
    }

    // Add view credit grant action
    actions.push({
      name: translate('notification.common.viewCreditGrant', locale),
      title: translate('notification.common.viewCreditGrant', locale),
      link: getCreditUsageLink(userDid),
    });

    // Add invoice action if applicable
    if (isPurchase && invoiceUrl) {
      actions.push({
        name: translate('notification.common.viewInvoice', locale),
        title: translate('notification.common.viewInvoice', locale),
        link: invoiceUrl,
      });
    }

    const template: BaseNotificationTemplateType = {
      title: translate(titleKey, locale, titleParams),
      body: translate(bodyKey, locale, bodyParams),
      attachments: [
        {
          type: 'section',
          fields,
        },
      ],
      actions,
    };

    return template;
  }
}
