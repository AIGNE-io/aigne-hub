export enum SubscriptionErrorType {
  UNSUBSCRIBED = 'UNSUBSCRIBED',
  NON_PAID = 'NON_PAID',
  EXCEEDED = 'EXCEEDED',
  UNKNOWN = 'UNKNOWN',
}

const SubscriptionErrors: Record<SubscriptionErrorType, string> = {
  [SubscriptionErrorType.UNSUBSCRIBED]:
    'Hello, in order to continue chatting, please first subscribe to AI-KIT service',
  [SubscriptionErrorType.NON_PAID]: 'You have not made a payment',
  [SubscriptionErrorType.EXCEEDED]: 'You have exceeded the usage limit',
  [SubscriptionErrorType.UNKNOWN]: 'An unknown error occurred',
};

export class SubscriptionError extends Error {
  timeStamp: string;

  type: SubscriptionErrorType;

  constructor(type: SubscriptionErrorType) {
    const message = SubscriptionErrors[type] || SubscriptionErrors[SubscriptionErrorType.UNKNOWN];
    super(message);

    this.timeStamp = new Date().toISOString();
    this.type = type;
  }
}
