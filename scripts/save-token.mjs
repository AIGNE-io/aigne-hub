#!/usr/bin/env node
/**
 * Save access token to credentials store
 * Usage: node scripts/save-token.mjs <env> <token>
 * Example: node scripts/save-token.mjs staging eyJhbGc...
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const ENV_URLS = {
  local: process.argv[4] || '',
  staging: 'https://staging-hub.aigne.io/app',
  production: 'https://hub.aigne.io/app',
};

const env = process.argv[2];
const token = process.argv[3];

if (!env || !token || !ENV_URLS[env]) {
  console.error('Usage: node scripts/save-token.mjs <env> <token>');
  console.error('Environments: local, staging, production');
  process.exit(1);
}

const hubUrl = ENV_URLS[env];
if (!hubUrl && env !== 'local') {
  console.error(`Hub URL required for ${env} environment`);
  console.error('Usage: node scripts/save-token.mjs local <token> <hub-url>');
  process.exit(1);
}

const storeDir = path.join(os.homedir(), '.aigne-hub');
const storeFile = path.join(storeDir, 'credentials.json');

if (!fs.existsSync(storeDir)) {
  fs.mkdirSync(storeDir, { recursive: true });
}

let creds = {};
if (fs.existsSync(storeFile)) {
  creds = JSON.parse(fs.readFileSync(storeFile, 'utf-8'));
}

const key = `${env}:${hubUrl}`;
creds[key] = { token, updatedAt: new Date().toISOString() };

fs.writeFileSync(storeFile, JSON.stringify(creds, null, 2));

console.log(`✅ Token saved to ${storeFile}`);
console.log(`   Environment: ${env}`);
console.log(`   Hub URL: ${hubUrl}`);
console.log(`\n🎉 You can now run: pnpm tsx scripts/analyze-pricing.ts --env ${env}`);
