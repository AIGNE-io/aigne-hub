import { getUrl } from '@blocklet/sdk';

import {
  BaseNotificationTemplate,
  BaseNotificationTemplateContext,
  BaseNotificationTemplateOptions,
  BaseNotificationTemplateType,
} from './base';

export interface CredentialInvalidNotificationTemplateOptions extends BaseNotificationTemplateOptions {}

export interface CredentialInvalidNotificationTemplateContext extends BaseNotificationTemplateContext {
  credential: {
    provider: string;
    model: string;
    credentialName: string;
    errorMessage: string;
    credentialValue: string;
  };
}

function translate(key: string, locale: string, params?: Record<string, any>): string {
  const translations = {
    en: {
      title: 'AIGNE Hub Credential Invalid',
      body: '{provider}/{model} {credentialName}:{credentialValue} credential is invalid: {errorMessage}. Please check it.',
      credentials: 'View Credentials',
    },
    zh: {
      title: 'AIGNE Hub 凭证已失效',
      body: '{provider}/{model} {credentialName}:{credentialValue} 凭证已失效：{errorMessage}。请检查。',
      credentials: '查看凭证',
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

export class CredentialInvalidNotificationTemplate extends BaseNotificationTemplate<
  CredentialInvalidNotificationTemplateContext,
  CredentialInvalidNotificationTemplateOptions
> {
  async getContext(): Promise<CredentialInvalidNotificationTemplateContext> {
    const { credential } = this.options;

    return {
      locale: 'en',
      userDid: '',
      credential,
    };
  }

  async getTemplate(): Promise<BaseNotificationTemplateType> {
    const context = await this.getContext();
    const { locale, credential } = context;

    const titleKey = 'title';
    const bodyKey = 'body';

    const template: BaseNotificationTemplateType = {
      title: translate(titleKey, locale, {}),
      body: translate(bodyKey, locale, {
        provider: credential.provider,
        model: credential.model,
        credentialName: credential.credentialName,
        credentialValue: credential.credentialValue,
        errorMessage: credential.errorMessage,
      }),
      actions: [
        {
          name: translate('credentials', locale),
          title: translate('credentials', locale),
          link: getUrl('/config/ai-config/providers'),
        },
      ],
    };

    return template;
  }
}
