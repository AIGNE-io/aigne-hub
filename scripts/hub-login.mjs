#!/usr/bin/env node
/**
 * Simple Hub login helper for getting access tokens
 * Usage: node scripts/hub-login.mjs <env>
 * Example: node scripts/hub-login.mjs staging
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { Client } from '@ocap/client';
import { fromJSON } from '@ocap/wallet';

const ENV_URLS = {
  local: process.argv[3] || '', // requires URL as 3rd arg
  staging: 'https://staging-hub.aigne.io',
  production: 'https://hub.aigne.io',
};

const env = process.argv[2];
if (!env || !ENV_URLS[env]) {
  console.error('Usage: node scripts/hub-login.mjs <env>');
  console.error('Environments: local, staging, production');
  process.exit(1);
}

const hubUrl = ENV_URLS[env];
if (!hubUrl) {
  console.error(`Hub URL required for ${env} environment`);
  console.error('Usage: node scripts/hub-login.mjs local <hub-url>');
  process.exit(1);
}

console.log(`🔐 Logging into ${env}: ${hubUrl}`);
console.log(`\nPlease provide your DID Wallet private key (sk) or JSON keystore:`);
console.log(`Press Ctrl+D when done\n`);

// Read wallet info from stdin
let input = '';
process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', async () => {
  try {
    const trimmed = input.trim();
    let wallet;

    // Try to parse as JSON first
    if (trimmed.startsWith('{')) {
      wallet = fromJSON(JSON.parse(trimmed));
    } else {
      // Assume it's a secret key
      wallet = fromJSON({ secretKey: trimmed });
    }

    console.log(`\n✅ Wallet loaded: ${wallet.address}`);

    // Get access token from Hub
    const client = new Client(hubUrl);
    const { token } = await client.getAccessToken(wallet);

    // Save to credentials store
    const storeDir = path.join(os.homedir(), '.aigne-hub');
    const storeFile = path.join(storeDir, 'credentials.json');

    if (!fs.existsSync(storeDir)) {
      fs.mkdirSync(storeDir, { recursive: true });
    }

    let creds = {};
    if (fs.existsSync(storeFile)) {
      creds = JSON.parse(fs.readFileSync(storeFile, 'utf-8'));
    }

    const key = `${env}:${hubUrl}/app`;
    creds[key] = { token, wallet: wallet.address, updatedAt: new Date().toISOString() };

    fs.writeFileSync(storeFile, JSON.stringify(creds, null, 2));

    console.log(`\n✅ Token saved to ${storeFile}`);
    console.log(`   Key: ${key}`);
    console.log(`\n🎉 You can now run: pnpm tsx scripts/analyze-pricing.ts --env ${env}`);
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
});
