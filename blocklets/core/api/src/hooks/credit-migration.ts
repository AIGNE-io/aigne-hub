/* eslint-disable no-console */
/**
 * Credit System Migration Script
 *
 * Migrates credit grants from old system (1 USD = 400,000 credits)
 * to new system (1 USD = 1 credit).
 */
import { BlockletStatus } from '@blocklet/constant';
import payment from '@blocklet/payment-js';
import config from '@blocklet/sdk/lib/config';
import BigNumber from 'bignumber.js';

import { DEFAULT_CREDIT_PAYMENT_LINK_KEY, DEFAULT_CREDIT_PRICE_KEY, METER_NAME, METER_UNIT } from '../libs/env';

const PAYMENT_DID = 'z2qaCNvKMv5GjouKdcDWexv6WqtHbpNPQDnAk';

function isPaymentRunning() {
  return !!config.components.find((i) => i.did === PAYMENT_DID && i.status === BlockletStatus.running);
}

const CONVERSION_FACTOR = 400000;
const OLD_METER_NAME = 'agent-hub-ai-meter';
const OLD_CREDIT_PRICE_KEY = 'DEFAULT_CREDIT_UNIT_PRICE';
const OLD_CREDIT_PAYMENT_LINK_KEY = 'DEFAULT_CREDIT_PAYMENT_LINK';

interface MigrationResult {
  grantId: string;
  customerId: string;
  oldAmount: string;
  newAmount: string;
  status: 'success' | 'skipped' | 'error';
  error?: string;
}

/**
 * Create new meter and product, copying metadata from old ones.
 */
async function createMeter(oldMeter: any): Promise<{ meter: any; currencyId: string }> {
  console.log('credit-migration: Creating new meter...');

  const meter = await payment.meters.create({
    name: oldMeter.name || 'AIGNE Hub AI Meter',
    description: oldMeter.description || 'AIGNE Hub AI Meter',
    event_name: METER_NAME,
    unit: METER_UNIT,
    aggregation_method: 'sum',
    decimal: 10,
    metadata: { ...oldMeter.metadata },
  } as any);

  console.log(`credit-migration: New meter created, currency_id: ${meter.currency_id}`);

  // Get old price and payment link to copy their configurations (may not exist)
  let oldPrice = null;
  let oldPaymentLink = null;
  try {
    oldPrice = await payment.prices.retrieve(OLD_CREDIT_PRICE_KEY);
  } catch {
    // Old price doesn't exist, will use defaults
  }
  try {
    oldPaymentLink = await payment.paymentLinks.retrieve(OLD_CREDIT_PAYMENT_LINK_KEY);
  } catch {
    // Old payment link doesn't exist, will use defaults
  }

  // Create new product, price and payment link
  try {
    const paymentCurrencies = await payment.paymentCurrencies.list({});
    await payment.products.create({
      name: oldPrice?.product?.name || 'Basic AIGNE Hub Credit Packs',
      description: oldPrice?.product?.description || `It is a basic pack of ${METER_UNIT}`,
      type: 'credit',
      prices: [
        {
          type: 'one_time',
          unit_amount: '1',
          lookup_key: DEFAULT_CREDIT_PRICE_KEY,
          nickname: oldPrice?.nickname || 'Per Unit Credit For AIGNE Hub',
          currency_id: paymentCurrencies[0]!.id,
          // @ts-ignore
          currency_options: paymentCurrencies.map((currency) => ({
            currency_id: currency.id,
            unit_amount: '1',
          })),
          metadata: {
            credit_config: {
              priority: oldPrice?.metadata?.credit_config?.priority ?? 50,
              valid_duration_value: oldPrice?.metadata?.credit_config?.valid_duration_value ?? 0,
              valid_duration_unit: oldPrice?.metadata?.credit_config?.valid_duration_unit || 'days',
              currency_id: meter.currency_id,
              credit_amount: '1',
            },
            meter_id: meter.id,
          },
        },
      ],
    });

    const price = await payment.prices.retrieve(DEFAULT_CREDIT_PRICE_KEY);
    if (price) {
      const paymentLink = await payment.paymentLinks.create({
        name: oldPaymentLink?.name || price.product.name,
        // @ts-ignore
        lookup_key: DEFAULT_CREDIT_PAYMENT_LINK_KEY,
        line_items: [
          {
            price_id: price.id,
            quantity: 1,
            adjustable_quantity: { enabled: true, minimum: 1, maximum: 100000000 },
          },
        ],
        metadata: { ...oldPaymentLink?.metadata },
      });

      await payment.paymentCurrencies.updateRechargeConfig(meter.currency_id!, {
        base_price_id: price.id,
        payment_link_id: paymentLink.id,
      });
      console.log('credit-migration: Product, price and payment link created');
    }
  } catch (error) {
    console.error('credit-migration: Failed to create product/price/payment-link:', error);
  }

  return { meter, currencyId: meter.currency_id! };
}

/**
 * Migrate a single credit grant to the new currency
 */
async function migrateGrant(grant: any, newCurrencyId: string): Promise<MigrationResult> {
  const { id: grantId, customer_id: customerId, amount = '0', status: grantStatus } = grant;
  const remainingAmount = grant.remaining_amount || amount;

  console.log(`Processing grant ${grantId}: status=${grantStatus}, amount=${amount}, remaining=${remainingAmount}`);

  // Skip non-active, already migrated, or zero balance grants
  if (grantStatus !== 'granted' && grantStatus !== 'pending') {
    console.log(`  Skipped: invalid status (${grantStatus})`);
    return { grantId, customerId, oldAmount: amount, newAmount: '0', status: 'skipped' };
  }
  // Check if old grant has already been migrated (more reliable than checking new grant)
  if (grant.metadata?.migratedTo) {
    console.log(`  Skipped: already migrated to ${grant.metadata.migratedTo}`);
    return { grantId, customerId, oldAmount: amount, newAmount: '0', status: 'skipped' };
  }
  if (new BigNumber(remainingAmount).lte(0)) {
    console.log('  Skipped: zero balance');
    return { grantId, customerId, oldAmount: remainingAmount, newAmount: '0', status: 'skipped' };
  }

  try {
    const newAmount = new BigNumber(remainingAmount).dividedBy(CONVERSION_FACTOR).toFixed(10);
    console.log(`  Migrating: ${remainingAmount} -> ${newAmount}`);

    // Create new grant with converted amount
    const newGrant = await payment.creditGrants.create({
      customer_id: customerId,
      currency_id: newCurrencyId,
      amount: newAmount,
      name: `[Migrated] ${grant.name || 'Credit Grant'}`,
      expires_at: grant.expires_at || 0,
      category: grant.category || 'promotional',
      metadata: {
        ...grant.metadata,
        migratedFromGrantId: grantId,
        migratedAt: new Date().toISOString(),
        originalAmount: remainingAmount,
        conversionFactor: CONVERSION_FACTOR,
      },
    });

    // Expire the old grant to prevent double-spending
    // @ts-ignore - expires_at is supported by the SDK
    await payment.creditGrants.update(grantId, {
      metadata: {
        migratedTo: newGrant.id,
      },
      // @ts-ignore
      expired: true,
    });

    return { grantId, customerId, oldAmount: remainingAmount, newAmount, status: 'success' };
  } catch (error: any) {
    console.error(`Failed to migrate grant ${grantId}:`, error);
    return { grantId, customerId, oldAmount: amount, newAmount: '0', status: 'error', error: error.message };
  }
}

/**
 * Run the credit migration.
 */
export async function runCreditMigration(): Promise<MigrationResult[]> {
  // Check if payment is running
  if (!isPaymentRunning()) {
    console.log('credit-migration: Payment is not running, skipping');
    return [];
  }

  // Check if migration is needed
  let oldMeter = null;
  try {
    oldMeter = await payment.meters.retrieve(OLD_METER_NAME);
  } catch (error: any) {
    // 404 means old meter doesn't exist (fresh install), other errors should be thrown
    if (error?.response?.status === 404) {
      console.log('credit-migration: No old meter found, skipping (fresh install)');
      return [];
    }
    throw error;
  }

  let newMeter = null;
  try {
    newMeter = await payment.meters.retrieve(METER_NAME);
  } catch (error: any) {
    // 404 is expected if new meter doesn't exist yet
    if (error?.response?.status !== 404) {
      throw error;
    }
  }

  // SKIP_CREATE_METER: Skip meter creation and only migrate grants (for retry scenarios)
  const skipCreateMeter = process.env.SKIP_CREATE_METER === 'true';

  if (newMeter?.status === 'active' && !skipCreateMeter) {
    console.log('credit-migration: New meter already exists, skipping');
    return [];
  }

  console.log('credit-migration: Starting migration...');
  const oldCurrencyId = oldMeter.currency_id;

  // Create new meter and product (or use existing if SKIP_CREATE_METER is set)
  let newCurrencyId: string;
  if (skipCreateMeter && newMeter?.currency_id) {
    console.log('credit-migration: SKIP_CREATE_METER is set, using existing meter');
    newCurrencyId = newMeter.currency_id;
  } else {
    const result = await createMeter(oldMeter);
    newCurrencyId = result.currencyId;
  }

  // Migrate all credit grants
  const results: MigrationResult[] = [];
  let page = 1;
  const pageSize = 100;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { list: grants = [] } = await payment.creditGrants.list({
        currency_id: oldCurrencyId,
        page,
        pageSize,
      });

      for (const grant of grants) {
        // eslint-disable-next-line no-await-in-loop
        results.push(await migrateGrant(grant, newCurrencyId));
      }

      if (grants.length < pageSize) break;

      page++;

      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, 300);
      });
    } catch (error) {
      console.error('Failed to fetch credit grants:', error);
      break;
    }
  }

  // Print summary
  const successful = results.filter((r) => r.status === 'success');
  const errors = results.filter((r) => r.status === 'error');

  console.log(`✅ Migration complete: ${successful.length} migrated, ${errors.length} errors`);
  if (errors.length > 0) {
    errors.forEach((e) => console.log(`  Error: ${e.grantId} - ${e.error}`));
  }

  return results;
}
