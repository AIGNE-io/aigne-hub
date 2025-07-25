export enum SubscriptionErrorType {
  UNSUBSCRIBED = 'UNSUBSCRIBED',
  UNKNOWN = 'UNKNOWN',
}

export enum CreditErrorType {
  NOT_ENOUGH = 'NOT_ENOUGH',
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
      message += `\n${link}`;
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
