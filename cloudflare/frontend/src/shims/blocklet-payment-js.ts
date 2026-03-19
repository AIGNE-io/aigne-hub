// Type stubs for @blocklet/payment-js
export interface TSubscriptionExpanded {
  id: string;
  status: string;
  plan?: {
    id: string;
    name: string;
    amount: number;
    currency: string;
  };
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  [key: string]: unknown;
}

export default {};
