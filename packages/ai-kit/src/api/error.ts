// Subscription is for v1 version subscription errors, will be deprecated in new versions but kept for compatibility
export enum SubscriptionErrorType {
  UNSUBSCRIBED = 'UNSUBSCRIBED',
  UNKNOWN = 'UNKNOWN',
}

const SubscriptionErrors: Record<SubscriptionErrorType, string> = {
  [SubscriptionErrorType.UNSUBSCRIBED]: 'To continue using this service, please subscribe to AIGNE Hub',
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

// ConfigError is for v2 version configuration errors, used for v1 version subscription errors
export enum ConfigErrorType {
  UNKNOWN = 'UNKNOWN',
  MISSING_API_KEY = 'MISSING_API_KEY',
  MISSING_DASHBOARD_CONFIG = 'MISSING_DASHBOARD_CONFIG',
}

const ConfigErrors: Record<ConfigErrorType, string> = {
  [ConfigErrorType.UNKNOWN]: 'An unknown error occurred',
  [ConfigErrorType.MISSING_API_KEY]: 'To continue, please configure your API key in the dashboard.',
  [ConfigErrorType.MISSING_DASHBOARD_CONFIG]:
    'Unable to connect to AIGNE Hub: missing baseUrl or accessKey.\nIf you are an administrator, please configure them in the dashboard.\nIf you are not an administrator, please contact your system administrator for assistance.',
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
  [CreditErrorType.NOT_ENOUGH]: 'Insufficient credits to continue. Please purchase credits using the link below.',
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
