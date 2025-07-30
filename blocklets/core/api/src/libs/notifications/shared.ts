import get from 'lodash/get';
import { joinURL, withQuery } from 'ufo';

import { blocklet, getConnectQueryParam } from '../auth';
import { getPaymentKitPrefix } from '../payment';

export const getUserLocale = async (userDid: string): Promise<'zh' | 'en'> => {
  const { user } = await blocklet.getUser(userDid);
  return get(user, 'locale', 'en') as 'zh' | 'en';
};

export function getCustomerIndexUrl({ locale, userDid }: { locale: string; userDid: string }) {
  return joinURL(getPaymentKitPrefix(), withQuery('customer', { locale, ...getConnectQueryParam({ userDid }) }));
}
