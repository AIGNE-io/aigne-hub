#!/usr/bin/env node
/**
 * AIGNE Hub Authentication - Browser-based DID login
 * Similar to myvibe-publish skill's auth flow
 *
 * Usage: node scripts/hub-auth.mjs <env>
 * Example: node scripts/hub-auth.mjs staging
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { createConnect } from '@aigne/cli/utils/aigne-hub/credential.js';
import chalk from 'chalk';
import open from 'open';

const ENV_URLS = {
  local: process.argv[3] || 'http://localhost:8090',
  staging: 'https://staging-hub.aigne.io',
  production: 'https://hub.aigne.io',
};

const WELLKNOWN_SERVICE_PATH = '/.well-known/service';
const AUTH_RETRY_COUNT = 60; // 轮询60次
const AUTH_FETCH_INTERVAL = 5000; // 每5秒轮询一次

async function main() {
  const env = process.argv[2];

  if (!env || !ENV_URLS[env]) {
    console.error(chalk.red('Usage: node scripts/hub-auth.mjs <env>'));
    console.error(chalk.gray('Environments: local, staging, production'));
    process.exit(1);
  }

  const hubUrl = ENV_URLS[env];
  const { origin } = new URL(hubUrl);
  const connectUrl = `${origin}${WELLKNOWN_SERVICE_PATH}`;

  console.log(chalk.bold('\n🔐 AIGNE Hub Authentication\n'));
  console.log(chalk.gray(`Environment: ${env}`));
  console.log(chalk.gray(`Hub URL: ${hubUrl}\n`));
  console.log(chalk.cyan('Opening browser for DID Wallet authentication...\n'));

  try {
    const result = await createConnect({
      connectUrl,
      connectAction: 'gen-simple-access-key',
      source: 'AIGNE Hub CLI',
      closeOnSuccess: true,
      appName: 'AIGNE Hub',
      appLogo: 'https://www.aigne.io/logo.svg',
      retry: AUTH_RETRY_COUNT,
      fetchInterval: AUTH_FETCH_INTERVAL,
      openPage: async (pageUrl) => {
        const url = new URL(pageUrl);
        url.searchParams.set('locale', 'en');

        if (process.env.CLAUDECODE) {
          url.searchParams.set('tipsTitleApp', 'Claude Code');
        }

        const authUrl = url.toString();

        // 自动打开浏览器
        try {
          await open(authUrl);
        } catch (err) {
          // 忽略打开失败，用户可以手动打开
        }

        console.log(chalk.cyan('🔗 Please open the following URL in your browser:'));
        console.log(chalk.underline(authUrl));
        console.log();
        console.log(chalk.gray('Waiting for authorization...'));
      },
    });

    const accessToken = result.accessKeySecret;

    // 保存token到credentials store
    const storeDir = path.join(os.homedir(), '.aigne-hub');
    const storeFile = path.join(storeDir, 'credentials.json');

    await fs.mkdir(storeDir, { recursive: true });

    let creds = {};
    try {
      const existing = await fs.readFile(storeFile, 'utf-8');
      creds = JSON.parse(existing);
    } catch (err) {
      // 文件不存在或解析失败，使用空对象
    }

    // 保存token，使用与analyze-pricing.ts一致的key格式
    const key = `${env}:${hubUrl}/app`;
    creds[key] = {
      token: accessToken,
      updatedAt: new Date().toISOString(),
    };

    await fs.writeFile(storeFile, JSON.stringify(creds, null, 2));

    console.log(chalk.green('\n✅ Authentication successful!'));
    console.log(chalk.gray(`Token saved to: ${storeFile}`));
    console.log(chalk.gray(`Credential key: ${key}\n`));
    console.log(chalk.cyan(`🎉 You can now run:`));
    console.log(chalk.bold(`   pnpm tsx scripts/analyze-pricing.ts --env ${env}\n`));
  } catch (error) {
    console.error(chalk.red('\n❌ Authentication failed'));
    console.error(chalk.gray('Possible causes:'));
    console.error(chalk.gray('  • Network issue'));
    console.error(chalk.gray('  • Authorization timeout (5 minutes)'));
    console.error(chalk.gray('  • User cancelled authorization'));
    console.error(chalk.gray('\nPlease try again.\n'));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(chalk.red('Error:'), error.message);
  process.exit(1);
});
