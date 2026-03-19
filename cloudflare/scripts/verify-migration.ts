/* eslint-disable no-console, prefer-template, prefer-destructuring */
/**
 * Verify data migration completeness.
 * Compares row counts between source SQLite and target D1.
 *
 * Usage:
 *   npx tsx scripts/verify-migration.ts --source=./aikit.db [--target=local]
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

const TABLES = [
  'Apps',
  'AiProviders',
  'AiCredentials',
  'AiModelRates',
  'AiModelRateHistories',
  'AiModelStatuses',
  'ModelCalls',
  'ModelCallStats',
  'Usages',
  'Projects',
  'ArchiveExecutionLogs',
];

function getSourceCount(dbPath: string, table: string): number {
  try {
    const result = execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM ${table}"`, { encoding: 'utf-8' });
    return parseInt(result.trim(), 10);
  } catch {
    return -1;
  }
}

function getD1Count(table: string, target: string): number {
  try {
    const remoteFlag = target === 'local' ? '--local' : '--remote';
    const envFlag = target !== 'local' ? `--env ${target}` : '';
    const dbName = target === 'local' ? 'aigne-hub-dev' : `aigne-hub-${target}`;

    const result = execSync(
      `npx wrangler d1 execute ${dbName} ${remoteFlag} ${envFlag} --command="SELECT COUNT(*) as count FROM ${table}" --json`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    const parsed = JSON.parse(result);
    return parsed[0]?.results?.[0]?.count ?? -1;
  } catch {
    return -1;
  }
}

function main() {
  const args = process.argv.slice(2);
  let source = '';
  let target = 'local';

  for (const arg of args) {
    if (arg.startsWith('--source=')) source = arg.split('=')[1];
    if (arg.startsWith('--target=')) target = arg.split('=')[1];
  }

  if (!source || !existsSync(source)) {
    console.error('Usage: npx tsx scripts/verify-migration.ts --source=./aikit.db');
    process.exit(1);
  }

  console.log('\n=== Migration Verification ===');
  console.log(`Source: ${source}`);
  console.log(`Target: D1 (${target})\n`);

  console.log('Table'.padEnd(25) + 'Source'.padEnd(10) + 'Target'.padEnd(10) + 'Match');
  console.log('-'.repeat(55));

  let allMatch = true;

  for (const table of TABLES) {
    const sourceCount = getSourceCount(source, table);
    const targetCount = getD1Count(table, target);
    const match = sourceCount === targetCount;

    if (!match) allMatch = false;

    const matchSymbol = sourceCount === -1 || targetCount === -1 ? '?' : match ? '✓' : '✗';
    console.log(table.padEnd(25) + String(sourceCount).padEnd(10) + String(targetCount).padEnd(10) + matchSymbol);
  }

  console.log('');
  if (allMatch) {
    console.log('✓ All tables match!');
  } else {
    console.log('✗ Some tables have mismatched counts. Investigate before going live.');
    process.exit(1);
  }
}

main();
