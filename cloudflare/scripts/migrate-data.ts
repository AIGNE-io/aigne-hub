/* eslint-disable no-console, prefer-template, prefer-destructuring, @typescript-eslint/quotes */
/**
 * SQLite → D1 data migration script.
 *
 * Usage:
 *   npx tsx scripts/migrate-data.ts --source=./aikit.db [--target=staging|production] [--dry-run] [--tables=Apps,AiProviders]
 *
 * Prerequisites:
 *   - Source SQLite database (exported from Blocklet Server)
 *   - wrangler configured with D1 bindings
 *   - D1 migration (0001_initial.sql) already applied to target
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

const BATCH_SIZE = 100;

interface MigrationOptions {
  source: string;
  target: string; // 'local' | 'staging' | 'production'
  dryRun: boolean;
  tables: string[];
}

function parseArgs(): MigrationOptions {
  const args = process.argv.slice(2);
  const options: MigrationOptions = {
    source: '',
    target: 'local',
    dryRun: false,
    tables: TABLES,
  };

  for (const arg of args) {
    if (arg.startsWith('--source=')) options.source = arg.split('=')[1];
    else if (arg.startsWith('--target=')) options.target = arg.split('=')[1];
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--tables=')) options.tables = arg.split('=')[1].split(',');
  }

  return options;
}

function exportTableFromSQLite(dbPath: string, tableName: string): Record<string, unknown>[] {
  try {
    const result = execSync(`sqlite3 -json "${dbPath}" "SELECT * FROM ${tableName}"`, {
      encoding: 'utf-8',
      maxBuffer: 100 * 1024 * 1024, // 100MB buffer
    });
    return JSON.parse(result || '[]');
  } catch (err) {
    console.error(`  Error exporting ${tableName}:`, (err as Error).message);
    return [];
  }
}

function escapeSQL(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  const str = String(value).replace(/'/g, "''");
  return `'${str}'`;
}

function buildInsertSQL(tableName: string, rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return [];

  const columns = Object.keys(rows[0]);
  const statements: string[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const values = batch.map((row) => `(${columns.map((col) => escapeSQL(row[col])).join(', ')})`).join(',\n  ');

    statements.push(
      `INSERT OR REPLACE INTO \`${tableName}\` (${columns.map((c) => `\`${c}\``).join(', ')})\nVALUES\n  ${values};`
    );
  }

  return statements;
}

async function main() {
  const options = parseArgs();

  if (!options.source) {
    console.error('Usage: npx tsx scripts/migrate-data.ts --source=./aikit.db [--target=local] [--dry-run]');
    process.exit(1);
  }

  if (!existsSync(options.source)) {
    console.error(`Source database not found: ${options.source}`);
    process.exit(1);
  }

  console.log(`\n=== AIGNE Hub Data Migration ===`);
  console.log(`Source:  ${options.source}`);
  console.log(`Target:  D1 (${options.target})`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log(`Tables:  ${options.tables.join(', ')}`);
  console.log('');

  const summary: { table: string; rows: number; status: string }[] = [];

  for (const tableName of options.tables) {
    console.log(`[${tableName}] Exporting from SQLite...`);
    const rows = exportTableFromSQLite(options.source, tableName);
    console.log(`[${tableName}] Found ${rows.length} rows`);

    if (rows.length === 0) {
      summary.push({ table: tableName, rows: 0, status: 'skipped (empty)' });
      continue;
    }

    const statements = buildInsertSQL(tableName, rows);
    console.log(`[${tableName}] Generated ${statements.length} INSERT batch(es)`);

    if (options.dryRun) {
      console.log(`[${tableName}] DRY RUN - would insert ${rows.length} rows`);
      summary.push({ table: tableName, rows: rows.length, status: 'dry-run' });
      continue;
    }

    // Execute via wrangler
    let totalInserted = 0;
    for (let i = 0; i < statements.length; i++) {
      const remoteFlag = options.target === 'local' ? '--local' : '--remote';
      const envFlag = options.target !== 'local' ? `--env ${options.target}` : '';
      const dbName = options.target === 'local' ? 'aigne-hub-dev' : `aigne-hub-${options.target}`;

      try {
        execSync(
          `npx wrangler d1 execute ${dbName} ${remoteFlag} ${envFlag} --command="${statements[i].replace(/"/g, '\\"')}"`,
          { encoding: 'utf-8', stdio: 'pipe' }
        );
        const batchSize = Math.min(BATCH_SIZE, rows.length - i * BATCH_SIZE);
        totalInserted += batchSize;
        process.stdout.write(`\r[${tableName}] Inserted ${totalInserted}/${rows.length} rows`);
      } catch (err) {
        console.error(`\n[${tableName}] Error in batch ${i + 1}:`, (err as Error).message);
        summary.push({ table: tableName, rows: totalInserted, status: `partial (${totalInserted}/${rows.length})` });
        break;
      }
    }

    console.log('');
    summary.push({ table: tableName, rows: totalInserted, status: 'ok' });
  }

  // Print summary
  console.log('\n=== Migration Summary ===');
  console.log('Table'.padEnd(25) + 'Rows'.padEnd(10) + 'Status');
  console.log('-'.repeat(50));
  for (const { table, rows, status } of summary) {
    console.log(table.padEnd(25) + String(rows).padEnd(10) + status);
  }
  console.log('');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
