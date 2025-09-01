import { translations as paymentTranslations } from '@blocklet/payment-react';
import merge from 'lodash/merge';

import en from './en';
import zh from './zh';

export const translations = merge(paymentTranslations, {
  en,
  zh,
});
