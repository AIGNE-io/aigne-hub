# Benchmark Samples

This directory stores benchmark sample data in JSONL format.

## Files

- `samples.jsonl` — all benchmark runs, append-only, one request per line

## Format

Each line is a JSON object with the schema defined in `../src/sample-store.ts` (see the `Sample` interface).

Key fields:

- `runId` — unique per benchmark script invocation
- `runTimestamp` — ISO8601 start time of the run
- `benchmarkName` — which script generated it (`comparison`, `multi-provider`, `billing-verify`, ...)
- `gitCommit` — git HEAD when the run started (traceability to code version)
- `gatewayEnabled` — whether Hub was running with CF AI Gateway enabled (from `HUB_GATEWAY_ENABLED` env var)
- `target` — the target being tested (e.g. `hub-openai`, `openai-direct`, `openrouter-direct`)
- `provider` / `model` — provider and model used
- `concurrency` — concurrency level for this request batch
- `stream` — whether streaming was used
- `ttfb`, `totalTime`, `streamingTime` — client-side latency metrics (ms)
- `usage` — token counts from response (`promptTokens`, `completionTokens`, `totalTokens`)
- `creditsUsed` — credits consumed (Hub-specific, from `x-credits-used` header)
- `requestId` — request identifier (for billing correlation with D1 `ModelCalls`)
- `serverTiming` — full breakdown of server-side phases from Hub's `Server-Timing` header:
  - `session`, `resolveProvider`, `preChecks`, `modelSetup`, `providerTtfb`, `streaming`, `usage`, `total`

## Querying

### With jq (simple filters)

```bash
# All hub-openai samples from a specific run
jq 'select(.target == "hub-openai" and .runId == "2026-04-10T12-34-56Z-a3f7")' samples.jsonl

# Count samples by target
jq -r '.target' samples.jsonl | sort | uniq -c

# Extract just ttfb values for a target
jq -c 'select(.target == "hub-openai") | .ttfb' samples.jsonl
```

### With DuckDB (SQL queries — recommended)

DuckDB can query JSONL files directly without importing:

```bash
# p50/p90 TTFB per target, latest run only
duckdb -c "
  WITH latest AS (
    SELECT MAX(runId) AS run FROM read_json_auto('data/samples.jsonl')
  )
  SELECT target, provider, COUNT(*) AS n,
         quantile_cont(ttfb, 0.5) AS p50_ttfb,
         quantile_cont(ttfb, 0.9) AS p90_ttfb,
         quantile_cont(totalTime, 0.5) AS p50_total
  FROM read_json_auto('data/samples.jsonl')
  WHERE runId = (SELECT run FROM latest) AND error IS NULL
  GROUP BY target, provider
  ORDER BY p50_ttfb
"

# Server-Timing phase breakdown for Hub targets
duckdb -c "
  SELECT target,
         quantile_cont(CAST(serverTiming->>'\$.session' AS DOUBLE), 0.5) AS session,
         quantile_cont(CAST(serverTiming->>'\$.resolveProvider' AS DOUBLE), 0.5) AS resolveProvider,
         quantile_cont(CAST(serverTiming->>'\$.preChecks' AS DOUBLE), 0.5) AS preChecks,
         quantile_cont(CAST(serverTiming->>'\$.providerTtfb' AS DOUBLE), 0.5) AS providerTtfb,
         quantile_cont(CAST(serverTiming->>'\$.total' AS DOUBLE), 0.5) AS total
  FROM read_json_auto('data/samples.jsonl')
  WHERE target LIKE 'hub-%' AND error IS NULL
  GROUP BY target
"

# Gateway on vs off comparison
duckdb -c "
  SELECT gatewayEnabled, target,
         COUNT(*) AS n,
         quantile_cont(ttfb, 0.5) AS p50_ttfb
  FROM read_json_auto('data/samples.jsonl')
  WHERE target LIKE 'hub-%' AND error IS NULL
  GROUP BY gatewayEnabled, target
  ORDER BY target, gatewayEnabled
"
```

## Retention

Samples accumulate indefinitely. Rotate or archive manually when the file gets large (`mv samples.jsonl samples-YYYY-MM.jsonl` then start fresh).

## Privacy

Samples may contain `requestId` and other request metadata. **Do not commit `*.jsonl` files to git.**
The `.gitignore` excludes them by default. Only this README and `.gitkeep` are committed.
