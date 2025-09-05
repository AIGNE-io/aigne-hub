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
      body: 'Your Credential {credentialValue} for {provider} is invalid, Please update or verify this credential to continue using the service.',
      credentials: 'Manage Credentials',
      provider: 'Provider',
      credentialName: 'Credential Name',
      credentialValue: 'Credential Value',
      errorMessage: 'Invalid Reason',
    },
    zh: {
      title: 'AIGNE Hub 凭证错误',
      body: '您在 {provider} 使用的 {credentialValue} 无效, 请更新或验证该凭证以继续使用服务。',
      credentials: '管理凭证',
      provider: '提供者',
      credentialName: '凭证名称',
      credentialValue: '凭证值',
      errorMessage: '错误原因',
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

    const fields = [
      {
        type: 'text',
        data: {
          type: 'plain',
          color: '#9397A1',
          text: translate('provider', locale),
        },
      },
      {
        type: 'text',
        data: {
          type: 'plain',
          text: credential.provider,
        },
      },
      {
        type: 'text',
        data: {
          type: 'plain',
          color: '#9397A1',
          text: translate('credentialName', locale),
        },
      },
      {
        type: 'text',
        data: {
          type: 'plain',
          text: credential.credentialName,
        },
      },
      {
        type: 'text',
        data: {
          type: 'plain',
          color: '#9397A1',
          text: translate('credentialValue', locale),
        },
      },
      {
        type: 'text',
        data: {
          type: 'plain',
          text: credential.credentialValue,
        },
      },
      {
        type: 'text',
        data: {
          type: 'plain',
          color: '#9397A1',
          text: translate('errorMessage', locale),
        },
      },
      {
        type: 'text',
        data: {
          type: 'plain',
          color: '#FF0000',
          text: credential.errorMessage,
        },
      },
    ];

    const template: BaseNotificationTemplateType = {
      title: translate(titleKey, locale, {}),
      body: translate(bodyKey, locale, {
        provider: credential.provider,
        model: credential.model,
        credentialName: credential.credentialName,
        credentialValue: credential.credentialValue,
        errorMessage: credential.errorMessage,
      }),
      attachments: [
        {
          type: 'section',
          fields,
        },
      ],
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
