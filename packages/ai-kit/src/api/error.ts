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
  [CreditErrorType.NOT_ENOUGH]: 'Hello, in order to continue chatting, please first buy some credits.',
  [CreditErrorType.UNKNOWN]: 'An unknown error occurred',
};

export class CreditError extends Error {
  timestamp: string;

  type: CreditErrorType;

  constructor(type: CreditErrorType) {
    const message = CreditErrors[type] || CreditErrors[CreditErrorType.UNKNOWN];
    super(message);

    this.timestamp = new Date().toISOString();
    this.type = type;
  }
}
