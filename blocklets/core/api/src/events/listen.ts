import { Config } from '@api/libs/env';
import logger from '@api/libs/logger';
import { ensureCustomer, ensureMeter, paymentClient } from '@api/libs/payment';
import { subscribe } from '@blocklet/sdk/lib/service/eventbus';

async function handleUserAdded(user: any) {
  if (!Config.creditBasedBillingEnabled || !Config.newUserCreditGrantEnabled) {
    return;
  }

  try {
    const customer = await ensureCustomer(user.did);
    if (!customer) {
      logger.error('failed to ensure customer');
      return;
    }
    const meter = await ensureMeter();
    if (!meter) {
      logger.error('failed to ensure meter');
      return;
    }
    const creditAmount = Config.newUserCreditGrantAmount ?? 0;
    if (creditAmount <= 0) {
      logger.error('credit amount is not valid');
      return;
    }

    const expiresAt = Config.creditExpirationDays
      ? Math.floor(Date.now() / 1000) + Config.creditExpirationDays * 24 * 60 * 60
      : 0;

    await paymentClient.creditGrants.create({
      customer_id: customer.id,
      currency_id: meter.currency_id!,
      amount: String(creditAmount),
      name: 'New user bonus credit',
      expires_at: expiresAt,
      category: 'promotional',
    });
    logger.info('new user bonus credit created', {
      customerId: customer.id,
      currencyId: meter.currency_id,
      amount: creditAmount,
      expiresAt,
    });
  } catch (error) {
    logger.error('failed to create new user bonus credit', error);
  }
}

export function subscribeEvents() {
  subscribe((event: any) => {
    if (event.type === 'blocklet.user.added') {
      logger.info('user.added', event.id);
      const user = event.data.object;
      handleUserAdded(user);
    }
  });
}
