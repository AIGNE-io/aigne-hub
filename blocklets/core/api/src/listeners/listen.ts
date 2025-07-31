import { blocklet } from '@api/libs/auth';
import { Config } from '@api/libs/env';
import { getLock } from '@api/libs/lock';
import logger from '@api/libs/logger';
import { handleCreditGranted } from '@api/libs/notifications';
import { ensureCustomer, ensureMeter, getUserCredits, paymentClient } from '@api/libs/payment';
import { subscribe } from '@blocklet/sdk/lib/service/eventbus';
import merge from 'lodash/merge';

async function markUserGranted(user: any) {
  const preSaveData = merge({}, user?.extra || {}, {
    AICreditGranted: true,
  });
  await blocklet.updateUserExtra({
    did: user.did,
    extra: JSON.stringify(preSaveData),
  });
}
async function checkNewUserCreditGrant(user: any, currencyId: string) {
  const { balance } = await getUserCredits({ userDid: user.did });

  if (balance !== '0') {
    logger.info('user has existing balance, skip credit grant', { userDid: user.did, balance });
    return false;
  }

  const existingCreditGrants = await paymentClient.creditGrants.list({
    customer_id: user.did,
    currency_id: currencyId,
  });

  if (existingCreditGrants.list.length > 0) {
    logger.info('user has existing credit grants, skip', {
      userDid: user.did,
      grantCount: existingCreditGrants.list.length,
    });
    return false;
  }

  return true;
}
async function handleUserAdded(user: any) {
  if (!Config.creditBasedBillingEnabled || !Config.newUserCreditGrantEnabled) {
    return;
  }
  const userCreditProcessKey = `user-credit-process-${user.did}`;

  if (user.extra?.AICreditGranted) {
    logger.info('user credit process already processed, skip', { userDid: user.did });
    return;
  }
  const lock = getLock(userCreditProcessKey);
  await lock.acquire();
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

    const isNewUserCreditGrant = await checkNewUserCreditGrant(user, meter.currency_id!);
    if (!isNewUserCreditGrant) {
      await markUserGranted(user);
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
      metadata: {
        welcomeCredit: true,
      },
    });
    logger.info('new user bonus credit created', {
      customerId: customer.id,
      currencyId: meter.currency_id,
      amount: creditAmount,
      expiresAt,
    });
    await markUserGranted(user);
  } catch (error) {
    logger.error('failed to create new user bonus credit', error);
  } finally {
    lock.release();
  }
}

const handleUserUpdated = async (user: any) => {
  if (!Config.creditBasedBillingEnabled || !Config.newUserCreditGrantEnabled) {
    return;
  }

  if (user.extra?.AICreditGranted) {
    logger.info('user credit process already processed, skip', { userDid: user.did });
    return;
  }

  const lock = getLock(`user-credit-process-${user.did}`);
  await lock.acquire();

  try {
    const customer = await ensureCustomer(user.did);
    if (!customer) {
      logger.error('failed to ensure customer');
      return;
    }

    const creditAmount = Config.newUserCreditGrantAmount ?? 0;
    if (creditAmount <= 0) {
      logger.error('credit amount is not valid');
      return;
    }

    const meter = await ensureMeter();
    if (!meter) {
      logger.error('failed to ensure meter');
      return;
    }

    const isNewUserCreditGrant = await checkNewUserCreditGrant(user, meter.currency_id!);
    if (!isNewUserCreditGrant) {
      await markUserGranted(user);
      return;
    }

    const expiresAt = Config.creditExpirationDays
      ? Math.floor(Date.now() / 1000) + Config.creditExpirationDays * 24 * 60 * 60
      : 0;

    await paymentClient.creditGrants.create({
      customer_id: customer.id,
      currency_id: meter.currency_id!,
      amount: String(creditAmount),
      name: 'First-time reward for existing users',
      expires_at: expiresAt,
      category: 'promotional',
      metadata: {
        welcomeCredit: true,
      },
    });

    await markUserGranted(user);

    logger.info('first-time reward for existing users created', {
      customerId: customer.id,
      currencyId: meter.currency_id,
      amount: creditAmount,
      expiresAt,
      userDid: user.did,
    });
  } catch (error) {
    logger.error('failed to create first-time reward for existing users', error);
  } finally {
    lock.release();
  }
};

export function subscribeEvents() {
  subscribe((event: any) => {
    if (event.type === 'blocklet.user.added') {
      logger.info('user.added', event.id, event.data.object?.did);
      const user = event.data.object;
      handleUserAdded(user);
    }
    if (event.type === 'blocklet.user.updated') {
      logger.info('user.updated', event.id, event.data.object?.did);
      const user = event.data.object;
      handleUserUpdated(user);
    }
    if (event.type === 'customer.credit_grant.granted') {
      logger.info('customer.credit_grant.granted', event.id);
      const creditGrant = event.data.object;
      handleCreditGranted(creditGrant, event.data.object.extraParams);
    }
  });
}
