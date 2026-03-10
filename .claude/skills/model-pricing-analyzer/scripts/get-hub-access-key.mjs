#!/usr/bin/env node
/**
 * Get AIGNE Hub Access Key - Simple wrapper around auth-hub.mjs
 *
 * Usage: node get-hub-access-key.mjs [hub-url]
 */

import { createConnect } from '@aigne/cli/utils/aigne-hub/credential.js';
import open from 'open';
import { joinURL } from 'ufo';

const DEFAULT_HUB_URL = 'https://hub.aigne.io';
const WELLKNOWN_SERVICE_PATH = '/.well-known/service';

async function getAccessKey(hubUrl) {
  const { origin } = new URL(hubUrl);
  const connectUrl = joinURL(origin, WELLKNOWN_SERVICE_PATH);

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
      open(url.toString());
    },
  });

  return result.accessKeySecret;
}

async function main() {
  const hubUrl = process.argv[2] || DEFAULT_HUB_URL;
  const token = await getAccessKey(hubUrl);
  console.log(token);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
