import type { User } from '@arcblock/ux/lib/type';
import type { TPaymentCurrency } from '@blocklet/payment-js';

export interface UserInfoResult {
  user: User;
  enableCredit: boolean;
  creditBalance: {
    balance: string;
    total: string;
    grantCount: number;
    pendingCredit: string;
  } | null;
  paymentLink: string | null;
  currency?: TPaymentCurrency;
  profileLink: string;
}
