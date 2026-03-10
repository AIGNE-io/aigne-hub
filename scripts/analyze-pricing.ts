#!/usr/bin/env npx ts-node
/**
 * Model Pricing Analyzer
 *
 * Fetches current model rates from AIGNE Hub API and compares them
 * against LiteLLM and OpenRouter external pricing sources.
 *
 * Usage:
 *   npx ts-node scripts/analyze-pricing.ts [options]
 *
 * Options:
 *   --env <env>         Environment: local, staging, production
 *   --hub-url <url>     Hub API base URL (overrides env default)
 *   --threshold <n>     Drift threshold as decimal (default: 0.1 = 10%)
 *   --json              Output as JSON instead of table
 *   --token <token>     Auth token (auto-loaded from credentials if env specified)
 *
 * Examples:
 *   pnpm tsx scripts/analyze-pricing.ts --env production
 *   pnpm tsx scripts/analyze-pricing.ts --env local --hub-url http://localhost:8090
 *   pnpm tsx scripts/analyze-pricing.ts --hub-url https://hub.aigne.io --token <token>
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import axios from 'axios';

import { buildApiUrl } from './detect-mount-point.mjs';

const LITELLM_API_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/models';

interface CliOptions {
  env?: string;
  hubUrl: string;
  threshold: number;
  json: boolean;
  token?: string;
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

interface DbRate {
  id: string;
  providerId: string;
  model: string;
  type: string;
  inputRate: string | number;
  outputRate: string | number;
  unitCosts?: { input: string | number; output: string | number };
  provider?: { id: string; name: string; displayName: string };
}

interface ExternalRate {
  inputCostPerToken: number;
  outputCostPerToken: number;
}

async function parseArgs(): Promise<CliOptions> {
  const args = process.argv.slice(2);
  const opts: CliOptions = {
    hubUrl: process.env.HUB_URL || 'http://localhost:8090',
    threshold: 0.1,
    json: false,
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
    }
  }

  // Apply environment defaults
  if (opts.env && ENV_URLS[opts.env] && !args.includes('--hub-url')) {
    opts.hubUrl = ENV_URLS[opts.env];
  }

  // Auto-load token from credentials store if env specified
  if (opts.env && !opts.token) {
    const storedToken = await loadStoredToken(opts.env, opts.hubUrl);
    if (storedToken) {
      opts.token = storedToken;
      console.log(`✅ Using stored credentials for ${opts.env}`);
    } else {
      console.log(`⚠️  No stored credentials for ${opts.env}:${opts.hubUrl}`);
      console.log(
        `   Run: node scripts/hub-auth.mjs login ${opts.env}${opts.env === 'local' ? ' ' + opts.hubUrl : ''}\n`
      );
    }
  }

  return opts;
}

function calcDrift(dbValue: number, sourceValue: number): number {
  if (sourceValue === 0) return dbValue === 0 ? 0 : 1;
  return Math.abs(dbValue - sourceValue) / Math.abs(sourceValue);
}

async function fetchDbRates(hubUrl: string, token?: string): Promise<DbRate[]> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    // Use dynamic mount point detection to build correct API URL
    const apiUrl = await buildApiUrl(hubUrl, '/api/ai-providers/model-rates');
    const res = await axios.get(apiUrl, {
      headers,
      timeout: 15000,
      params: { pageSize: 1000 },
    });
    return res.data?.list || res.data?.data?.list || [];
  } catch (err: any) {
    console.error(`Failed to fetch DB rates from ${hubUrl}: ${err.message}`);
    return [];
  }
}

async function fetchLiteLLM(): Promise<Map<string, ExternalRate>> {
  const map = new Map<string, ExternalRate>();
  try {
    const res = await axios.get(LITELLM_API_URL, { timeout: 30000 });
    const data = res.data || {};
    for (const [key, val] of Object.entries(data) as [string, any][]) {
      if (key === 'sample_spec') continue;
      if (val.input_cost_per_token !== undefined && val.output_cost_per_token !== undefined) {
        // Extract provider prefix and model name
        const provider = val.litellm_provider || '';
        const parts = key.split('/');
        const modelName = parts.length > 1 ? parts.slice(1).join('/') : key;
        map.set(`${provider}/${modelName}`, {
          inputCostPerToken: val.input_cost_per_token,
          outputCostPerToken: val.output_cost_per_token,
        });
      }
    }
    console.log(`Fetched ${map.size} models from LiteLLM`);
  } catch (err: any) {
    console.error(`Failed to fetch LiteLLM data: ${err.message}`);
  }
  return map;
}

async function fetchOpenRouter(): Promise<Map<string, ExternalRate>> {
  const map = new Map<string, ExternalRate>();
  const providerMap: Record<string, string> = {
    openai: 'openai',
    anthropic: 'anthropic',
    google: 'google',
    deepseek: 'deepseek',
    'x-ai': 'xai',
  };

  try {
    const res = await axios.get(OPENROUTER_API_URL, { timeout: 30000 });
    const models = res.data?.data || [];
    for (const model of models) {
      if (!model.pricing?.prompt || !model.pricing?.completion) continue;
      const slashIdx = model.id.indexOf('/');
      if (slashIdx === -1) continue;
      const prefix = model.id.substring(0, slashIdx);
      const modelName = model.id.substring(slashIdx + 1);
      const provider = providerMap[prefix] || prefix;
      const input = parseFloat(model.pricing.prompt);
      const output = parseFloat(model.pricing.completion);
      if (!isNaN(input) && !isNaN(output)) {
        map.set(`${provider}/${modelName}`, { inputCostPerToken: input, outputCostPerToken: output });
      }
    }
    console.log(`Fetched ${map.size} models from OpenRouter`);
  } catch (err: any) {
    console.error(`Failed to fetch OpenRouter data: ${err.message}`);
  }
  return map;
}

interface ComparisonResult {
  provider: string;
  model: string;
  type: string;
  dbInput: number;
  dbOutput: number;
  litellmInput?: number;
  litellmOutput?: number;
  litellmDrift?: number;
  openrouterInput?: number;
  openrouterOutput?: number;
  openrouterDrift?: number;
  maxDrift: number;
  exceedsThreshold: boolean;
  missingUnitCosts: boolean;
  // Pricing sanity check: inputRate/outputRate vs unitCosts
  inputRate?: number;
  outputRate?: number;
  inputRateIssue?: number; // Negative = loss (rate < cost)
  outputRateIssue?: number; // Negative = loss (rate < cost)
  hasPricingIssue: boolean;
}

function compare(
  dbRates: DbRate[],
  litellm: Map<string, ExternalRate>,
  openrouter: Map<string, ExternalRate>,
  threshold: number
): ComparisonResult[] {
  const results: ComparisonResult[] = [];

  for (const rate of dbRates) {
    const providerName = rate.provider?.name || '';
    // For OpenRouter provider, the model name already contains provider prefix (e.g., "anthropic/claude-opus-4")
    // For other providers, use "provider/model" format
    const lookupKey = providerName === 'openrouter' ? rate.model : `${providerName}/${rate.model}`;
    const hasUnitCosts =
      rate.unitCosts != null && (Number(rate.unitCosts.input) > 0 || Number(rate.unitCosts.output) > 0);
    const dbInput = hasUnitCosts ? Number(rate.unitCosts!.input ?? 0) : 0;
    const dbOutput = hasUnitCosts ? Number(rate.unitCosts!.output ?? 0) : 0;

    const ll = litellm.get(lookupKey);
    const or = openrouter.get(lookupKey);

    // Initialize result - we'll still check pricing even without external sources
    let maxDrift = 0;
    const result: ComparisonResult = {
      provider: providerName,
      model: rate.model,
      type: rate.type,
      dbInput,
      dbOutput,
      maxDrift: 0,
      exceedsThreshold: false,
      missingUnitCosts: !hasUnitCosts,
      hasPricingIssue: false,
    };

    if (ll) {
      result.litellmInput = ll.inputCostPerToken;
      result.litellmOutput = ll.outputCostPerToken;
      if (!result.missingUnitCosts) {
        const inputDrift = calcDrift(dbInput, ll.inputCostPerToken);
        const outputDrift = calcDrift(dbOutput, ll.outputCostPerToken);
        result.litellmDrift = Math.max(inputDrift, outputDrift);
        maxDrift = Math.max(maxDrift, result.litellmDrift);
      }
    }

    if (or) {
      result.openrouterInput = or.inputCostPerToken;
      result.openrouterOutput = or.outputCostPerToken;
      if (!result.missingUnitCosts) {
        const inputDrift = calcDrift(dbInput, or.inputCostPerToken);
        const outputDrift = calcDrift(dbOutput, or.outputCostPerToken);
        result.openrouterDrift = Math.max(inputDrift, outputDrift);
        maxDrift = Math.max(maxDrift, result.openrouterDrift);
      }
    }

    result.maxDrift = maxDrift;
    result.exceedsThreshold = !result.missingUnitCosts && maxDrift > threshold;

    // Check pricing sanity: inputRate/outputRate vs unitCosts (skip if unitCosts missing)
    if (hasUnitCosts && (rate.inputRate || rate.outputRate)) {
      const unitInputCost = Number(rate.unitCosts.input);
      const unitOutputCost = Number(rate.unitCosts.output);
      const inputRate = Number(rate.inputRate ?? 0);
      const outputRate = Number(rate.outputRate ?? 0);

      result.inputRate = inputRate;
      result.outputRate = outputRate;

      // Calculate percentage: (rate - cost) / cost * 100
      // Negative = loss (rate < cost), Positive = profit
      if (unitInputCost > 0 && inputRate > 0) {
        result.inputRateIssue = ((inputRate - unitInputCost) / unitInputCost) * 100;
      }
      if (unitOutputCost > 0 && outputRate > 0) {
        result.outputRateIssue = ((outputRate - unitOutputCost) / unitOutputCost) * 100;
      }

      // Flag as issue if either rate is below cost (negative margin)
      result.hasPricingIssue =
        (result.inputRateIssue !== undefined && result.inputRateIssue < 0) ||
        (result.outputRateIssue !== undefined && result.outputRateIssue < 0);
    } else {
      result.hasPricingIssue = false;
    }

    results.push(result);
  }

  results.sort((a, b) => b.maxDrift - a.maxDrift);
  return results;
}

function printTable(results: ComparisonResult[], threshold: number): void {
  const drifted = results.filter((r) => r.exceedsThreshold);
  const ok = results.filter((r) => !r.exceedsThreshold);

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Rate Comparison Report  (threshold: ${(threshold * 100).toFixed(0)}%)`);
  console.log(`${'='.repeat(80)}\n`);

  if (drifted.length > 0) {
    console.log(`⚠ ${drifted.length} model(s) exceed drift threshold:\n`);
    console.log(
      padRight('Provider', 15) +
        padRight('Model', 35) +
        padRight('Type', 18) +
        padRight('DB Input', 14) +
        padRight('DB Output', 14) +
        padRight('Max Drift', 12)
    );
    console.log('-'.repeat(108));

    for (const r of drifted) {
      console.log(
        padRight(r.provider, 15) +
          padRight(r.model, 35) +
          padRight(r.type, 18) +
          padRight(formatCost(r.dbInput), 14) +
          padRight(formatCost(r.dbOutput), 14) +
          padRight(`${(r.maxDrift * 100).toFixed(1)}%`, 12)
      );

      if (r.litellmInput !== undefined) {
        console.log(
          padRight('', 15) +
            padRight('  └ LiteLLM', 35) +
            padRight('', 18) +
            padRight(formatCost(r.litellmInput), 14) +
            padRight(formatCost(r.litellmOutput!), 14) +
            padRight(`${((r.litellmDrift || 0) * 100).toFixed(1)}%`, 12)
        );
      }
      if (r.openrouterInput !== undefined) {
        console.log(
          padRight('', 15) +
            padRight('  └ OpenRouter', 35) +
            padRight('', 18) +
            padRight(formatCost(r.openrouterInput), 14) +
            padRight(formatCost(r.openrouterOutput!), 14) +
            padRight(`${((r.openrouterDrift || 0) * 100).toFixed(1)}%`, 12)
        );
      }
    }
  }

  const missingCosts = results.filter((r) => r.missingUnitCosts);
  if (missingCosts.length > 0) {
    console.log(`\n⚠ ${missingCosts.length} model(s) missing unitCosts (drift check skipped):`);
    for (const r of missingCosts) {
      console.log(`  ${r.provider}/${r.model}`);
    }
  }

  console.log(`\n✓ ${ok.length - missingCosts.length} model(s) within threshold`);
  console.log(`Total: ${results.length} model(s) checked\n`);

  // Check for pricing issues (rate < cost)
  const pricingIssues = results.filter((r) => r.hasPricingIssue);
  if (pricingIssues.length > 0) {
    console.log(`${'='.repeat(80)}`);
    console.log(`⚠️  PRICING ISSUES: Rate Below Cost (Loss Risk)`);
    console.log(`${'='.repeat(80)}\n`);
    console.log(
      padRight('Provider', 15) +
        padRight('Model', 30) +
        padRight('Cost', 14) +
        padRight('Rate', 14) +
        padRight('Margin', 12) +
        padRight('Status', 15)
    );
    console.log('-'.repeat(100));

    for (const r of pricingIssues) {
      if (r.inputRateIssue !== undefined && r.inputRateIssue < 0) {
        console.log(
          padRight(r.provider, 15) +
            padRight(`${r.model} (input)`, 30) +
            padRight(formatCost(r.dbInput), 14) +
            padRight(formatCost(r.inputRate!), 14) +
            padRight(`${r.inputRateIssue.toFixed(1)}%`, 12) +
            padRight('🔴 LOSS', 15)
        );
      }
      if (r.outputRateIssue !== undefined && r.outputRateIssue < 0) {
        console.log(
          padRight(r.provider, 15) +
            padRight(`${r.model} (output)`, 30) +
            padRight(formatCost(r.dbOutput), 14) +
            padRight(formatCost(r.outputRate!), 14) +
            padRight(`${r.outputRateIssue.toFixed(1)}%`, 12) +
            padRight('🔴 LOSS', 15)
        );
      }
    }
    console.log(`\nℹ️  Negative margin means actual rate is below cost - system will lose money!\n`);
  }

  // Generate bulk-rate-update suggestions for drifted models
  if (drifted.length > 0) {
    console.log(`${'='.repeat(80)}`);
    console.log('Suggested bulk-rate-update API call:');
    console.log(`${'='.repeat(80)}\n`);

    const updates = drifted
      .filter((r) => r.litellmInput !== undefined || r.openrouterInput !== undefined)
      .map((r) => {
        // Prefer LiteLLM as the update source, fallback to OpenRouter
        const source = r.litellmInput !== undefined ? 'litellm' : 'openrouter';
        const input = source === 'litellm' ? r.litellmInput! : r.openrouterInput!;
        const output = source === 'litellm' ? r.litellmOutput! : r.openrouterOutput!;
        return {
          provider: r.provider,
          model: r.model,
          type: r.type,
          unitCosts: { input, output },
          source,
        };
      });

    console.log('POST /api/ai-providers/bulk-rate-update');
    console.log(JSON.stringify({ rates: updates }, null, 2));
  }
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function formatCost(cost: number): string {
  if (cost === 0) return '0';
  if (cost < 0.000001) return cost.toExponential(2);
  return cost.toPrecision(4);
}

async function main(): Promise<void> {
  const opts = await parseArgs();
  console.log(`AIGNE Hub Pricing Analyzer`);
  console.log(`Hub URL: ${opts.hubUrl}`);
  console.log(`Threshold: ${(opts.threshold * 100).toFixed(0)}%\n`);

  // Fetch all sources in parallel
  const [dbRates, litellm, openrouter] = await Promise.all([
    fetchDbRates(opts.hubUrl, opts.token),
    fetchLiteLLM(),
    fetchOpenRouter(),
  ]);

  if (dbRates.length === 0) {
    console.error('No DB rates found. Check Hub URL and authentication.');
    process.exit(1);
  }

  console.log(`Fetched ${dbRates.length} rates from DB\n`);

  const results = compare(dbRates, litellm, openrouter, opts.threshold);

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    printTable(results, opts.threshold);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
