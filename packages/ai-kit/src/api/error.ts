// Subscription 为v1版本订阅错误, 新版本将废弃，保留是为了兼容
export enum SubscriptionErrorType {
  UNSUBSCRIBED = 'UNSUBSCRIBED',
  UNKNOWN = 'UNKNOWN',
}

const SubscriptionErrors: Record<SubscriptionErrorType, string> = {
  [SubscriptionErrorType.UNSUBSCRIBED]:
    'Hello, in order to continue chatting, please first subscribe to AI-KIT service',
  [SubscriptionErrorType.UNKNOWN]: 'An unknown error occurred',
};

export class SubscriptionError extends Error {
  timestamp: string;

  type: SubscriptionErrorType;

  constructor(type: SubscriptionErrorType) {
    const message = SubscriptionErrors[type] || SubscriptionErrors[SubscriptionErrorType.UNKNOWN];
    super(message);

    this.timestamp = new Date().toISOString();
    this.type = type;
  }
}

// ConfigError 为v2版本配置错误, 用于v1版本订阅错误
export enum ConfigErrorType {
  UNKNOWN = 'UNKNOWN',
  MISSING_API_KEY = 'MISSING_API_KEY',
  MISSING_DASHBOARD_CONFIG = 'MISSING_DASHBOARD_CONFIG',
}

const ConfigErrors: Record<ConfigErrorType, string> = {
  [ConfigErrorType.UNKNOWN]: 'An unknown error occurred',
  [ConfigErrorType.MISSING_API_KEY]:
    'Hello, in order to continue chatting, please first configure the API key in the dashboard.',
  [ConfigErrorType.MISSING_DASHBOARD_CONFIG]:
    'Unable to connect to AIGNE Hub: missing baseUrl or accessKey.\n If you are an administrator, please configure them in the dashboard.\n If you are not an administrator, please contact your system admin for assistance.',
};

export class ConfigError extends Error {
  timestamp: string;

  type: ConfigErrorType;

  link?: string;

  constructor(type: ConfigErrorType, link?: string) {
    let message = ConfigErrors[type] || ConfigErrors[ConfigErrorType.UNKNOWN];
    if (link) {
      message += `\n${link}`;
    }
    super(message);

    this.timestamp = new Date().toISOString();
    this.type = type;
    this.link = link;
  }
}

export enum CreditErrorType {
  NOT_ENOUGH = 'NOT_ENOUGH',
  UNKNOWN = 'UNKNOWN',
}

const CreditErrors: Record<CreditErrorType, string> = {
  [CreditErrorType.NOT_ENOUGH]:
    'Hello, in order to continue chatting, please first buy some credits in the link below.',
  [CreditErrorType.UNKNOWN]: 'An unknown error occurred',
};

export class CreditError extends Error {
  timestamp: string;

  type: CreditErrorType;

  statusCode: number;

  link?: string;

  constructor(statusCode: number, type: CreditErrorType, link?: string) {
    let message = CreditErrors[type] || CreditErrors[CreditErrorType.UNKNOWN];
    if (type === CreditErrorType.NOT_ENOUGH && link) {
      message += ` ${link}`;
    }
    super(message);

    this.timestamp = new Date().toISOString();
    this.type = type;
    this.statusCode = statusCode || 500;
    this.link = link;
  }
}

export class StatusCodeError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}
