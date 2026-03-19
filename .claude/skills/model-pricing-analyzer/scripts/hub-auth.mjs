#!/usr/bin/env node
/**
 * AIGNE Hub Multi-Environment Authentication Manager
 *
 * Supports three environments: local, staging, production
 * Manages access keys per environment
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { createConnect } from '@aigne/cli/utils/aigne-hub/credential.js';
import open from 'open';
import { joinURL } from 'ufo';

const WELLKNOWN_SERVICE_PATH = '/.well-known/service';
const STORE_DIR = path.join(os.homedir(), '.aigne-hub');
const STORE_FILE = path.join(STORE_DIR, 'credentials.json');

// Environment configurations
const ENVIRONMENTS = {
  local: {
    name: 'Local Development',
    url: null, // Will be provided by user
  },
  staging: {
    name: 'Staging',
    url: 'https://staging.hub.aigne.io', // Update with actual URL
  },
  production: {
    name: 'Production',
    url: 'https://hub.aigne.io',
  },
};

/**
 * Load stored credentials
 */
async function loadCredentials() {
  try {
    await fs.mkdir(STORE_DIR, { recursive: true });
    const data = await fs.readFile(STORE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

/**
 * Save credentials
 */
async function saveCredentials(creds) {
  await fs.mkdir(STORE_DIR, { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(creds, null, 2));
}

/**
 * Get cached access token for an environment
 */
async function getCachedToken(env, hubUrl) {
  const creds = await loadCredentials();
  const envKey = `${env}:${hubUrl}`;
  return creds[envKey]?.token || null;
}

/**
 * Save access token for an environment
 */
async function saveToken(env, hubUrl, token, user) {
  const creds = await loadCredentials();
  const envKey = `${env}:${hubUrl}`;
  creds[envKey] = {
    token,
    user,
    createdAt: new Date().toISOString(),
  };
  await saveCredentials(creds);
}

/**
 * Clear credentials for an environment
 */
async function clearToken(env, hubUrl) {
  const creds = await loadCredentials();
  const envKey = hubUrl ? `${env}:${hubUrl}` : null;

  if (envKey) {
    delete creds[envKey];
    console.log(`✅ Cleared credentials for ${env} (${hubUrl})`);
  } else {
    // Clear all credentials for this environment
    Object.keys(creds).forEach((key) => {
      if (key.startsWith(`${env}:`)) {
        delete creds[key];
      }
    });
    console.log(`✅ Cleared all credentials for ${env}`);
  }

  await saveCredentials(creds);
}

/**
 * List all stored credentials
 */
async function listCredentials() {
  const creds = await loadCredentials();
  const entries = Object.entries(creds);

  if (entries.length === 0) {
    console.log('📭 No stored credentials');
    return;
  }

  console.log('\n📋 Stored Credentials:\n');
  for (const [key, value] of entries) {
    const [env, url] = key.split(':', 2);
    console.log(`  ${env.toUpperCase()} - ${url}`);
    console.log(`    User: ${value.user || 'N/A'}`);
    console.log(`    Created: ${value.createdAt}`);
    console.log(`    Token: ${value.token.substring(0, 20)}...`);
    console.log('');
  }
}

/**
 * Authenticate and get access key
 */
async function authenticate(env, hubUrl, force = false) {
  const envName = ENVIRONMENTS[env]?.name || env;

  console.log(`\n🔐 Authenticating for ${envName}`);
  console.log(`📡 Hub URL: ${hubUrl}\n`);

  // Check for cached token
  if (!force) {
    const cachedToken = await getCachedToken(env, hubUrl);
    if (cachedToken) {
      console.log(`✅ Using cached token for ${env}`);
      console.log(`🔑 Token: ${cachedToken}\n`);
      return cachedToken;
    }
  }

  // Need to authenticate
  const connectUrl = joinURL(hubUrl, WELLKNOWN_SERVICE_PATH);

  try {
    const result = await createConnect({
      connectUrl,
      connectAction: 'gen-simple-access-key',
      source: `AIGNE Hub Pricing Analyzer (${envName})`,
      closeOnSuccess: true,
      appName: `AIGNE Hub - ${envName}`,
      retry: 10,
      fetchInterval: 3000,
      openPage: async (pageUrl) => {
        const url = new URL(pageUrl);
        if (process.env.CLAUDECODE) {
          url.searchParams.set('tipsTitleApp', 'Claude Code');
        }

        const authUrl = url.toString();
        console.log(`🌐 Opening browser for authorization...`);
        console.log(`   ${authUrl}\n`);

        open(authUrl);
      },
    });

    const token = result.accessKeySecret;
    const user = result.user?.did || result.user?.name || 'unknown';

    // Save token
    await saveToken(env, hubUrl, token, user);

    console.log(`\n✅ Authorization successful!`);
    console.log(`🔑 Access Token: ${token}`);
    console.log(`👤 User: ${user}\n`);

    return token;
  } catch (error) {
    console.error(`\n❌ Authorization failed: ${error.message}\n`);
    process.exit(1);
  }
}

/**
 * Main CLI
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'login': {
      const env = args[1] || 'local';
      let hubUrl = args[2];

      // Use predefined URL if available
      if (ENVIRONMENTS[env] && ENVIRONMENTS[env].url) {
        hubUrl = hubUrl || ENVIRONMENTS[env].url;
      }

      if (!hubUrl) {
        console.error('❌ Error: Hub URL required for local environment');
        console.log('\nUsage: node hub-auth.mjs login <env> <hub-url>');
        console.log('       node hub-auth.mjs login staging');
        console.log('       node hub-auth.mjs login production');
        console.log('       node hub-auth.mjs login local http://localhost:8090');
        process.exit(1);
      }

      const force = args.includes('--force');
      await authenticate(env, hubUrl, force);
      break;
    }

    case 'logout': {
      const env = args[1];
      const hubUrl = args[2];

      if (!env) {
        console.error('❌ Error: Environment required');
        console.log('\nUsage: node hub-auth.mjs logout <env> [hub-url]');
        console.log('       node hub-auth.mjs logout staging');
        console.log('       node hub-auth.mjs logout local http://localhost:8090');
        process.exit(1);
      }

      await clearToken(env, hubUrl);
      break;
    }

    case 'list': {
      await listCredentials();
      break;
    }

    case 'get': {
      const env = args[1] || 'local';
      let hubUrl = args[2];

      if (ENVIRONMENTS[env] && ENVIRONMENTS[env].url) {
        hubUrl = hubUrl || ENVIRONMENTS[env].url;
      }

      if (!hubUrl) {
        console.error('❌ Error: Hub URL required');
        process.exit(1);
      }

      const token = await getCachedToken(env, hubUrl);
      if (token) {
        console.log(token);
      } else {
        console.error(`❌ No token found for ${env}:${hubUrl}`);
        console.log(`\nRun: node hub-auth.mjs login ${env} ${hubUrl}`);
        process.exit(1);
      }
      break;
    }

    default: {
      console.log(`
AIGNE Hub Multi-Environment Authentication Manager

Usage:
  node hub-auth.mjs <command> [options]

Commands:
  login <env> [url]     Authenticate and save token
                        Examples:
                          login production
                          login staging
                          login local http://localhost:8090
                          login production --force (re-authenticate)

  logout <env> [url]    Clear stored credentials
                        Examples:
                          logout production
                          logout local http://localhost:8090
                          logout staging (clears all staging tokens)

  list                  Show all stored credentials

  get <env> [url]       Get token for environment (for scripts)
                        Examples:
                          get production
                          get local http://localhost:8090

Environments:
  local                 Local development (custom URL)
  staging               Staging environment
  production            Production environment

Storage:
  Credentials stored in: ${STORE_FILE}
`);
      break;
    }
  }
}

main().catch(console.error);
