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

  // 4. Output
  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
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

      // Write JSON to temp file
      await fs.writeFile(tempFile, JSON.stringify(results, null, 2));

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
