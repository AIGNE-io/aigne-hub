#!/usr/bin/env node
/**
 * AIGNE Hub Authentication Helper
 *
 * Uses @aigne/cli's createConnect to get access key
 * Based on myvibe-publish implementation
 */

import { createConnect } from '@aigne/cli/utils/aigne-hub/credential.js';
import open from 'open';
import { joinURL } from 'ufo';

const DEFAULT_HUB_URL = 'https://hub.aigne.io';
const WELLKNOWN_SERVICE_PATH = '/.well-known/service';

async function authenticate(hubUrl) {
  const { origin } = new URL(hubUrl);
  const connectUrl = joinURL(origin, WELLKNOWN_SERVICE_PATH);

  console.log(`\n🔐 Starting authentication for: ${hubUrl}`);
  console.log(`📡 Connect URL: ${connectUrl}\n`);

  try {
    const result = await createConnect({
      connectUrl,
      connectAction: 'gen-simple-access-key',
      source: 'AIGNE Hub Pricing Analyzer',
      closeOnSuccess: true,
      appName: 'AIGNE Hub',
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

    const accessToken = result.accessKeySecret;

    console.log(`\n✅ Authorization successful!`);
    console.log(`\n🔑 Access Token:`);
    console.log(`   ${accessToken}\n`);

    console.log(`💾 Save this token:`);
    console.log(`   export HUB_ACCESS_TOKEN="${accessToken}"\n`);

    console.log(`📋 Or use directly in script:`);
    console.log(`   pnpm tsx scripts/analyze-pricing.ts --hub-url ${hubUrl} --token ${accessToken}\n`);

    return accessToken;
  } catch (error) {
    console.error(`\n❌ Authorization failed: ${error.message}\n`);
    process.exit(1);
  }
}

async function main() {
  const hubUrl = process.argv[2] || DEFAULT_HUB_URL;
  await authenticate(hubUrl);
}

main().catch(console.error);
