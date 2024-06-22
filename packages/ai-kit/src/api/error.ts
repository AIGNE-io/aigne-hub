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
