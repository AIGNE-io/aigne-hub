#!/usr/bin/env npx ts-node
/**
 * Model Pricing Analyzer — CLI Entry Point
 *
 * Fetches current model rates from AIGNE Hub API and compares them
 * against LiteLLM, OpenRouter, and official pricing data.
 *
 * Always fetches real-time official pricing by automatically running the
 * catalog scraper in parallel with other data sources.
 *
 * Usage:
 *   npx ts-node scripts/analyze-pricing.ts [options]
 *
 * Options:
 *   --env <env>         Environment: local, staging, production
 *   --hub-url <url>     Hub API base URL (overrides env default)
 *   --threshold <n>     Drift threshold as decimal (default: 0.1 = 10%)
 *   --json              Output as JSON instead of table
 *   --token <token>     Auth token (only needed for write operations, read is public)
 *   --no-scrape         Skip official pricing scrape, use existing cache
 *
 * Examples:
 *   pnpm tsx scripts/analyze-pricing.ts --env staging
 *   pnpm tsx scripts/analyze-pricing.ts --env production --json
 *   pnpm tsx scripts/analyze-pricing.ts --env staging --no-scrape
 */

import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

import { compare, printTable } from './compare';
import { fetchDbRates, fetchLiteLLM, fetchOpenRouter, loadOfficialPricingCache } from './fetch-sources';
import type { DbRate } from './fetch-sources';
import type { OfficialPricingEntry } from './pricing-schema';
import { PROVIDER_TIERS, modelNameFallbacks, resolveModelMapping } from './provider-aliases';

const execFileAsync = promisify(execFile);

interface CliOptions {
  env?: string;
  hubUrl: string;
  threshold: number;
  json: boolean;
  token?: string;
  noScrape: boolean;
}

const ENV_URLS: Record<string, string> = {
  local: '', // Must be provided via --hub-url (dynamic DID address)
  staging: 'https://staging-hub.aigne.io',
  production: 'https://hub.aigne.io',
};

async function loadStoredToken(env: string, hubUrl: string): Promise<string | null> {
  try {
    const storeFile = path.join(os.homedir(), '.aigne-hub', 'credentials.json');
    const data = await fs.readFile(storeFile, 'utf-8');
    const creds = JSON.parse(data);
    const envKey = `${env}:${hubUrl}`;
    return creds[envKey]?.token || null;
  } catch (error) {
    return null;
  }
}

async function parseArgs(): Promise<CliOptions> {
  const args = process.argv.slice(2);
  const opts: CliOptions = {
    hubUrl: process.env.HUB_URL || 'http://localhost:8090',
    threshold: 0.1,
    json: false,
    noScrape: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--env':
        opts.env = args[++i];
        break;
      case '--hub-url':
        opts.hubUrl = args[++i] || opts.hubUrl;
        break;
      case '--threshold':
        opts.threshold = parseFloat(args[++i] || '0.1');
        break;
      case '--json':
        opts.json = true;
        break;
      case '--token':
        opts.token = args[++i];
        break;
      case '--no-scrape':
        opts.noScrape = true;
        break;
    }
  }

  // Apply environment defaults
  if (opts.env && ENV_URLS[opts.env] && !args.includes('--hub-url')) {
    opts.hubUrl = ENV_URLS[opts.env];
  }

  // Auto-load token from credentials store if env specified
  // Note: model-rates API is publicly readable, token only needed for write operations (bulk-rate-update)
  if (opts.env && !opts.token) {
    const storedToken = await loadStoredToken(opts.env, opts.hubUrl);
    if (storedToken) {
      opts.token = storedToken;
      console.error(`✅ Using stored credentials for ${opts.env}`);
    }
  }

  return opts;
}

async function refreshOfficialPricing(log: (...args: any[]) => void): Promise<void> {
  const scriptDir = new URL('.', import.meta.url).pathname;
  const catalogScript = path.join(scriptDir, 'official-pricing-catalog.mjs');

  log('🔄 Scraping real-time official pricing data...');
  try {
    const { stderr } = await execFileAsync('node', [catalogScript, '--cache'], {
      timeout: 120000,
    });
    if (stderr) {
      for (const line of stderr.split('\n').filter(Boolean)) {
        log(`  ${line}`);
      }
    }
  } catch (err: any) {
    // execFile rejects on non-zero exit, but stderr may still contain useful output
    if (err.stderr) {
      for (const line of err.stderr.split('\n').filter(Boolean)) {
        log(`  ${line}`);
      }
    }
    console.error(`⚠️  Official pricing scrape had issues: ${err.message}`);
  }
}

async function askGenerateHtml(): Promise<boolean> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('\n📊 Generate HTML report? (y/N): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Find official pricing entries that exist in the cache but have no corresponding DB model.
 * This is the "reverse lookup" — official → DB direction.
 */
function findUnmatchedOfficialModels(
  dbRates: DbRate[],
  officialCache: Map<string, OfficialPricingEntry>
): OfficialPricingEntry[] {
  // 1. Compute relevant tier1 providers from DB rates
  const tier2Set = new Set(PROVIDER_TIERS.tier2 as readonly string[]);
  const relevantProviders = new Set<string>();

  // Collect all cache keys that DB models have matched (or could match)
  const matchedKeys = new Set<string>();

  for (const rate of dbRates) {
    const providerName = rate.provider?.name || '';
    const { primaryProvider, primaryModel } = resolveModelMapping(rate.model, providerName);

    // Track the tier1 provider as relevant
    if (!tier2Set.has(primaryProvider)) {
      relevantProviders.add(primaryProvider);
    }

    // Build all possible lookup keys this DB model would match against
    const baseKey = `${primaryProvider}/${primaryModel}`;
    matchedKeys.add(baseKey);

    // Also add fallback keys
    const fallbacks = modelNameFallbacks(primaryModel);
    for (const fb of fallbacks) {
      matchedKeys.add(`${primaryProvider}/${fb}`);
    }

    // For tier1 providers used directly, also mark with original provider name
    if (providerName && providerName !== primaryProvider) {
      matchedKeys.add(`${providerName}/${rate.model}`);
    }
  }

  // 2. Iterate official cache, collect unmatched entries from relevant providers
  const unmatched: OfficialPricingEntry[] = [];
  for (const [key, entry] of officialCache) {
    // Skip type-qualified keys (e.g. "openai/gpt-4o::chatCompletion") to avoid duplicates
    if (key.includes('::')) continue;

    // Only include models from providers that are relevant (exist in DB)
    if (!relevantProviders.has(entry.provider)) continue;

    // Check if this model was matched by any DB model
    if (!matchedKeys.has(key)) {
      unmatched.push(entry);
    }
  }

  return unmatched;
}

async function main(): Promise<void> {
  const opts = await parseArgs();
  // Use stderr for info logs so --json output stays clean on stdout
  const log = opts.json ? console.error.bind(console) : console.log.bind(console);
  log(`AIGNE Hub Pricing Analyzer`);
  log(`Hub URL: ${opts.hubUrl}`);
  log(`Threshold: ${(opts.threshold * 100).toFixed(0)}%\n`);

  // 1. Fetch ALL data sources in parallel (including fresh official pricing scrape)
  const scrapePromise = opts.noScrape ? Promise.resolve() : refreshOfficialPricing(log);

  const [, dbRates, litellm, openrouter] = await Promise.all([
    scrapePromise,
    fetchDbRates(opts.hubUrl, opts.token),
    fetchLiteLLM(),
    fetchOpenRouter(),
  ]);

  // 2. Read the (now-fresh) official pricing cache
  const officialCache = await loadOfficialPricingCache();
  if (!officialCache) {
    console.error('⚠️  Official pricing data unavailable.');
    if (opts.noScrape) {
      console.error('   Hint: remove --no-scrape to auto-fetch official pricing.');
    }
  } else {
    // Map contains both base keys and type-qualified keys; count unique base keys only
    const uniqueModels = new Set([...officialCache.keys()].filter((k) => !k.includes('::')));
    log(`✅ Official pricing: ${uniqueModels.size} models from provider docs`);
  }

  if (dbRates.length === 0) {
    console.error('No DB rates found. Check Hub URL and authentication.');
    process.exit(1);
  }

  log(`Fetched ${dbRates.length} rates from DB\n`);

  // 3. Compare
  const providerPages = officialCache ?? new Map();
  const results = compare(dbRates, litellm, openrouter, providerPages, opts.threshold);

  // 4. Find unmatched official models (reverse lookup)
  const unmatchedModels = providerPages.size > 0 ? findUnmatchedOfficialModels(dbRates, providerPages) : [];
  if (unmatchedModels.length > 0) {
    log(`📋 官方未录入模型: ${unmatchedModels.length} 个`);
  }

  // 5. Output
  const fullOutput = { results, unmatchedModels };
  if (opts.json) {
    console.log(JSON.stringify(fullOutput, null, 2));
  } else {
    printTable(results, opts.threshold);

    // Ask if user wants to generate HTML report
    const shouldGenerateHtml = await askGenerateHtml();
    if (shouldGenerateHtml) {
      const { execSync } = await import('child_process');
      const scriptDir = new URL('.', import.meta.url).pathname;
      const outputDir = path.join(scriptDir, '..', 'output');
      await fs.mkdir(outputDir, { recursive: true });
      const tempFile = path.join(outputDir, 'pricing-analysis.json');
      const outputFile = path.join(outputDir, `pricing-report-${opts.env || 'local'}.html`);

      // Write JSON to temp file (full output with unmatchedModels)
      await fs.writeFile(tempFile, JSON.stringify(fullOutput, null, 2));

      // Generate HTML report
      const reportScript = `${scriptDir}/generate-html-report.mjs`;

      try {
        console.log('\n📝 Generating HTML report...');
        execSync(`node "${reportScript}" "${tempFile}" "${outputFile}" "${opts.hubUrl}"`, { stdio: 'inherit' });

        // Open in browser
        console.log('\n🌐 Opening report in browser...');
        const openCommand =
          process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        execSync(`${openCommand} "${outputFile}"`);
      } catch (err) {
        console.error('Failed to generate HTML report:', err);
      }
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
