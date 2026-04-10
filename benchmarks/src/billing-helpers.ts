/**
 * Billing verification helpers.
 *
 * Queries the staging D1 database via the wrangler CLI (subprocess) to
 * fetch ModelCalls records for billing accuracy checks. This avoids the
 * need for D1 REST API credentials — wrangler already has auth configured.
 */
import { execSync } from 'child_process';

const WRANGLER_BIN = '/Users/zac/work/arcblock/aigne-hub/node_modules/.bin/wrangler';
const WRANGLER_CONFIG = '/Users/zac/work/arcblock/aigne-hub/cloudflare/wrangler.local.toml';
const WRANGLER_CWD = '/Users/zac/work/arcblock/aigne-hub/cloudflare';
const DB_NAME = 'aigne-hub-staging';

interface D1ExecuteResult {
  results: Record<string, unknown>[];
  success: boolean;
  meta?: Record<string, unknown>;
}

/**
 * Execute a SQL query against the staging D1 via `wrangler d1 execute`.
 * Returns the `results` array from the first (and only) statement.
 */
export function queryD1(sql: string): Record<string, unknown>[] {
  const args = [
    'd1',
    'execute',
    DB_NAME,
    '--remote',
    '--config',
    WRANGLER_CONFIG,
    '--json',
    '--command',
    sql,
  ];
  // Pass arguments individually to avoid shell quoting issues
  const cmd = `${WRANGLER_BIN} ${args.map((a) => JSON.stringify(a)).join(' ')}`;

  try {
    const output = execSync(cmd, {
      encoding: 'utf8',
      cwd: WRANGLER_CWD,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024, // 50MB for large result sets
    });
    const parsed = JSON.parse(output) as D1ExecuteResult[];
    return parsed[0]?.results ?? [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`D1 query failed: ${msg.substring(0, 500)}\nSQL: ${sql.substring(0, 300)}`);
  }
}

// ── ModelCalls Queries ───────────────────────────────────────────────

export interface ModelCallRecord {
  id: string;
  providerId: string;
  model: string;
  status: string;
  totalUsage: number;
  credits: string;
  duration: string;
  userDid: string | null;
  requestId: string | null;
  ttfb: string | null;
  providerTtfb: string | null;
  createdAt: string;
  errorReason: string | null;
}

/**
 * Fetch ModelCalls records matching a requestId prefix.
 * Used by billing-verify to find records for a specific run.
 */
export function getModelCallsByRequestIdPrefix(prefix: string): ModelCallRecord[] {
  const esc = prefix.replace(/'/g, "''");
  const sql = `SELECT id, providerId, model, status, totalUsage, credits, duration, userDid, requestId, ttfb, providerTtfb, createdAt, errorReason FROM ModelCalls WHERE requestId LIKE '${esc}%' ORDER BY createdAt ASC`;
  return queryD1(sql) as unknown as ModelCallRecord[];
}

/**
 * Aggregate stats for a requestId prefix.
 */
export function getAggregateStats(prefix: string): {
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  totalCredits: number;
  totalTokens: number;
} {
  const esc = prefix.replace(/'/g, "''");
  const sql = `SELECT COUNT(*) as totalCalls, SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successCalls, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedCalls, SUM(CAST(credits AS REAL)) as totalCredits, SUM(totalUsage) as totalTokens FROM ModelCalls WHERE requestId LIKE '${esc}%'`;
  const row = queryD1(sql)[0] ?? {};
  return {
    totalCalls: Number(row.totalCalls ?? 0),
    successCalls: Number(row.successCalls ?? 0),
    failedCalls: Number(row.failedCalls ?? 0),
    totalCredits: Number(row.totalCredits ?? 0),
    totalTokens: Number(row.totalTokens ?? 0),
  };
}

// ── Billing Diff ─────────────────────────────────────────────────────

export interface ClientObservation {
  requestId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  creditsUsed?: number;
}

export interface BillingDiff {
  requestId: string;
  status: 'match' | 'token-mismatch' | 'credits-mismatch' | 'missing';
  clientTokens: number;
  dbTokens: number;
  tokenDiff: number;
  dbCredits: number;
  dbStatus?: string;
}

/**
 * Compare client-side observations against D1 ModelCalls records.
 * Tolerance for token mismatch: 2 tokens or 5% (whichever is larger).
 */
export function compareBillingRecords(
  clientObs: ClientObservation[],
  dbRecords: ModelCallRecord[]
): { diffs: BillingDiff[]; matchRate: number } {
  const dbByRequestId = new Map(dbRecords.filter((r) => r.requestId).map((r) => [r.requestId!, r]));

  const diffs: BillingDiff[] = [];
  let matches = 0;

  for (const obs of clientObs) {
    const dbRecord = dbByRequestId.get(obs.requestId);
    if (!dbRecord) {
      diffs.push({
        requestId: obs.requestId,
        status: 'missing',
        clientTokens: obs.totalTokens,
        dbTokens: 0,
        tokenDiff: obs.totalTokens,
        dbCredits: 0,
      });
      continue;
    }

    const clientTokens = obs.totalTokens;
    const dbTokens = dbRecord.totalUsage;
    const diff = Math.abs(clientTokens - dbTokens);
    const tolerance = Math.max(2, clientTokens * 0.05);
    const tokenMatch = diff <= tolerance;

    diffs.push({
      requestId: obs.requestId,
      status: tokenMatch ? 'match' : 'token-mismatch',
      clientTokens,
      dbTokens,
      tokenDiff: dbTokens - clientTokens,
      dbCredits: parseFloat(dbRecord.credits),
      dbStatus: dbRecord.status,
    });

    if (tokenMatch) matches++;
  }

  const matchRate = clientObs.length > 0 ? (matches / clientObs.length) * 100 : 0;
  return { diffs, matchRate };
}
