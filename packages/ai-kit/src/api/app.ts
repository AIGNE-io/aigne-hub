import api from './api';

export interface AppStatusResult {
  id: string;
  // FIXME: use `TSubscriptionExpanded` after issue (https://github.com/sequelize/sequelize/issues/16268) fixed
  subscription?: any;
  subscriptionDetailUrl?: string;
  config?: AIKitServiceConfig | null;
}

export async function appStatus(): Promise<AppStatusResult> {
  return Promise.all([api.get('/api/app/service/status'), appConfig()]).then(([res, config]) => ({
    ...res.data,
    config,
  }));
}

export interface AIKitServiceConfig {
  useAIKitService?: boolean;
}

export async function appConfig(): Promise<AIKitServiceConfig | null> {
  return api.get('/api/app/config').then((res) => res.data);
}

export async function setAppConfig(payload: AIKitServiceConfig): Promise<AIKitServiceConfig> {
  return api.patch('/api/app/config', payload).then((res) => res.data);
}

export interface AppRegisterResult {
  appId: string;
  paymentLink?: string;
}

export async function appServiceRegister(): Promise<AppRegisterResult> {
  return api.post('/api/app/service/register').then((res) => res.data);
}

export interface AppUsedCreditsResult {
  model: string;
  date: string;
  usedCredits: string;
  promptTokens: number;
  completionTokens: number;
  numberOfImageGeneration: number;
}

export async function appUsedCredits(
  query: { startTime?: string; endTime: string },
  options?: { useAIKitService?: boolean }
): Promise<{ list: AppUsedCreditsResult[] }> {
  return api
    .get(options?.useAIKitService ? '/api/app/service/usage' : '/api/app/usage', { params: query })
    .then((res) => res.data);
}

export async function unsubscribe(): Promise<void> {
  return api.post('/api/app/service/unsubscribe');
}

export async function getCreditPaymentLink(options?: { useAIKitService?: boolean }): Promise<string> {
  const endpoint = options?.useAIKitService ? '/api/user/service/credit/payment-link' : '/api/user/credit/payment-link';
  return api.get(endpoint).then((res) => res.data);
}

// Credit Balance Types
export interface CreditBalanceResult {
  balance: string;
  currency: {
    id: string;
    symbol: string;
    name: string;
    decimal: number;
    maximum_precision: number;
  };
  total: string;
  grantCount: number;
}

// Credit Grants Types
export interface CreditGrant {
  id: string;
  name: string;
  status: string;
  remainingCredit: number;
  scope: string;
  effectiveDate: string;
  expirationDate?: string;
}

export interface CreditGrantsResult {
  creditGrants: {
    data: CreditGrant[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
}

// Credit Transactions Types
export interface CreditTransaction {
  id: string;
  quantity: string;
  credit_amount: string;
  remaining_balance: string;
  description: string;
  created_at: string;
  creditGrant: {
    id: string;
    name: string;
  };
  paymentCurrency: {
    id: string;
    symbol: string;
    decimal: number;
  };
}

export interface CreditTransactionsResult {
  count: number;
  list: CreditTransaction[];
  paging: {
    page: number;
    pageSize: number;
  };
}

// Get credit balance
export async function getCreditBalance(options?: { useAIKitService?: boolean }): Promise<CreditBalanceResult> {
  const endpoint = options?.useAIKitService ? '/api/user/service/credit/balance' : '/api/user/credit/balance';
  return api.get(endpoint).then((res) => res.data);
}

// Get credit grants
export async function getCreditGrants(
  params?: {
    page?: number;
    pageSize?: number;
    start?: number;
    end?: number;
  },
  options?: { useAIKitService?: boolean }
): Promise<CreditGrantsResult> {
  const endpoint = options?.useAIKitService ? '/api/user/service/credit/grants' : '/api/user/credit/grants';
  return api.get(endpoint, { params }).then((res) => res.data);
}

export async function getCreditTransactions(
  params?: {
    page?: number;
    pageSize?: number;
    start?: number;
    end?: number;
  },
  options?: { useAIKitService?: boolean }
): Promise<CreditTransactionsResult> {
  const endpoint = options?.useAIKitService ? '/api/user/service/credit/transactions' : '/api/user/credit/transactions';
  return api.get(endpoint, { params }).then((res) => res.data);
}
