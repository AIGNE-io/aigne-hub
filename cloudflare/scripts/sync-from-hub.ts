/* eslint-disable no-console, prefer-template, prefer-destructuring, prefer-const, no-await-in-loop, @typescript-eslint/quotes */
/**
 * Sync data from a running AIGNE Hub instance into local D1.
 *
 * Usage:
 *   npx tsx scripts/sync-from-hub.ts --hub=https://your-hub-url [--admin-did=xxx] [--admin-role=admin]
 *
 * This fetches providers, model rates, and model statuses from the Hub's public API
 * and inserts them into the local D1 database.
 */

import { execSync } from 'child_process';

interface HubProvider {
  id: string;
  name: string;
  displayName: string;
  baseUrl?: string;
  region?: string;
  enabled: boolean;
  config?: unknown;
  credentials?: unknown[];
}

interface HubModelRate {
  id: string;
  providerId: string;
  model: string;
  modelDisplay: string;
  description?: string;
  type: string;
  inputRate: string;
  outputRate: string;
  unitCosts?: unknown;
  caching?: unknown;
  modelMetadata?: unknown;
  deprecated: boolean;
  provider?: { id: string; name: string; displayName: string; baseUrl?: string; region?: string; enabled: boolean };
  status?: { available: boolean; error?: unknown };
}

function escapeSQL(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

function d1Execute(sql: string) {
  try {
    execSync(`npx wrangler d1 execute aigne-hub-dev --local --command="${sql.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  } catch (err) {
    console.error('D1 execute failed:', (err as Error).message?.substring(0, 200));
  }
}

async function main() {
  const args = process.argv.slice(2);
  let hubUrl = '';
  let adminDid = '';
  let adminRole = 'admin';

  for (const arg of args) {
    if (arg.startsWith('--hub=')) hubUrl = arg.split('=')[1].replace(/\/$/, '');
    if (arg.startsWith('--admin-did=')) adminDid = arg.split('=')[1];
    if (arg.startsWith('--admin-role=')) adminRole = arg.split('=')[1];
  }

  if (!hubUrl) {
    console.error('Usage: npx tsx scripts/sync-from-hub.ts --hub=https://your-hub-url');
    process.exit(1);
  }

  console.log(`\n=== Sync from AIGNE Hub ===`);
  console.log(`Hub URL: ${hubUrl}\n`);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (adminDid) {
    headers['x-user-did'] = adminDid;
    headers['x-user-role'] = adminRole;
  }

  // 1. Fetch providers (needs admin)
  console.log('[Providers] Fetching...');
  let providers: HubProvider[] = [];
  try {
    const res = await fetch(`${hubUrl}/api/ai-providers`, { headers });
    if (res.ok) {
      providers = (await res.json()) as HubProvider[];
      console.log(`[Providers] Got ${providers.length} providers`);
    } else {
      console.log(`[Providers] API returned ${res.status} - trying model-rates to extract providers`);
    }
  } catch (err) {
    console.log(`[Providers] Fetch failed: ${(err as Error).message}`);
  }

  // 2. Fetch model rates (public API) - paginated
  console.log('[Model Rates] Fetching...');
  let rates: HubModelRate[] = [];
  try {
    let page = 1;
    const pageSize = 100;
    let total = 0;
    do {
      const res = await fetch(
        `${hubUrl}/api/ai-providers/model-rates?pageSize=${pageSize}&page=${page}&includeDeprecated=true`
      );
      if (!res.ok) {
        console.log(`[Model Rates] API returned ${res.status}`);
        break;
      }
      const data = (await res.json()) as { list?: HubModelRate[]; data?: HubModelRate[]; count?: number };
      const batch = data.list || data.data || [];
      rates.push(...batch);
      total = data.count || batch.length;
      console.log(`[Model Rates] Page ${page}: got ${batch.length} (total: ${total})`);
      page++;
    } while (rates.length < total);
    console.log(`[Model Rates] Total: ${rates.length}`);
  } catch (err) {
    console.log(`[Model Rates] Fetch failed: ${(err as Error).message}`);
  }

  // 3. Extract providers from rates if not fetched directly
  if (providers.length === 0 && rates.length > 0) {
    const providerMap = new Map<string, HubProvider>();
    for (const rate of rates) {
      if (rate.provider && !providerMap.has(rate.provider.id)) {
        providerMap.set(rate.provider.id, {
          id: rate.provider.id,
          name: rate.provider.name,
          displayName: rate.provider.displayName,
          baseUrl: rate.provider.baseUrl,
          region: rate.provider.region,
          enabled: rate.provider.enabled,
        });
      }
    }
    providers = Array.from(providerMap.values());
    console.log(`[Providers] Extracted ${providers.length} providers from rates`);
  }

  // 4. Clear existing data
  console.log('\n[D1] Clearing existing data...');
  d1Execute('DELETE FROM AiModelStatuses');
  d1Execute('DELETE FROM AiModelRates');
  d1Execute('DELETE FROM AiProviders');

  // 5. Insert providers
  console.log(`[D1] Inserting ${providers.length} providers...`);
  for (const p of providers) {
    d1Execute(
      `INSERT OR REPLACE INTO AiProviders (id, name, displayName, baseUrl, region, enabled, config, createdAt, updatedAt) VALUES (${escapeSQL(p.id)}, ${escapeSQL(p.name)}, ${escapeSQL(p.displayName)}, ${escapeSQL(p.baseUrl)}, ${escapeSQL(p.region)}, ${escapeSQL(p.enabled)}, ${escapeSQL(p.config)}, datetime('now'), datetime('now'))`
    );
  }

  // 6. Insert model rates
  console.log(`[D1] Inserting ${rates.length} model rates...`);
  let inserted = 0;
  for (const r of rates) {
    d1Execute(
      `INSERT OR REPLACE INTO AiModelRates (id, providerId, model, modelDisplay, description, type, inputRate, outputRate, unitCosts, caching, modelMetadata, deprecated, createdAt, updatedAt) VALUES (${escapeSQL(r.id)}, ${escapeSQL(r.providerId)}, ${escapeSQL(r.model)}, ${escapeSQL(r.modelDisplay)}, ${escapeSQL(r.description)}, ${escapeSQL(r.type)}, ${escapeSQL(r.inputRate)}, ${escapeSQL(r.outputRate)}, ${escapeSQL(r.unitCosts)}, ${escapeSQL(r.caching)}, ${escapeSQL(r.modelMetadata)}, ${escapeSQL(r.deprecated)}, datetime('now'), datetime('now'))`
    );
    inserted++;
    if (inserted % 10 === 0) process.stdout.write(`\r[D1] Inserted ${inserted}/${rates.length} rates`);
  }
  console.log(`\r[D1] Inserted ${inserted}/${rates.length} rates`);

  // 7. Insert model statuses from rate status info
  let statusCount = 0;
  for (const r of rates) {
    if (r.status) {
      d1Execute(
        `INSERT OR REPLACE INTO AiModelStatuses (id, providerId, model, type, available, error, lastChecked, createdAt, updatedAt) VALUES (${escapeSQL(`s-${r.id}`)}, ${escapeSQL(r.providerId)}, ${escapeSQL(r.model)}, ${escapeSQL(r.type)}, ${escapeSQL(r.status.available)}, ${escapeSQL(r.status.error)}, datetime('now'), datetime('now'), datetime('now'))`
      );
      statusCount++;
    }
  }
  console.log(`[D1] Inserted ${statusCount} model statuses`);

  // Summary
  console.log(`\n=== Sync Complete ===`);
  console.log(`Providers: ${providers.length}`);
  console.log(`Model Rates: ${rates.length}`);
  console.log(`Model Statuses: ${statusCount}`);
}

main().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
