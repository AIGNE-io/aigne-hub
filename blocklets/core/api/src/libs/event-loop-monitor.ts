import { monitorEventLoopDelay } from 'perf_hooks';

import logger from './logger';

const SAMPLE_INTERVAL_MS = 60_000;
const RESOLUTION_MS = 20;
const WARN_P99_MS = 200;

/**
 * Start a process-wide event loop lag sampler. Every minute we read the
 * percentile distribution of how long callbacks waited before running and,
 * when the p99 crosses a threshold, emit a `[event-loop-lag]` warn together
 * with current memory pressure.
 *
 * Why: handler-level timers can only see latency once Express dispatches the
 * request. Long synchronous work in *another* request (e.g. the JSON.parse +
 * reduce in `getGlobalTrends`) blocks the whole process, which shows up as
 * "occasional 8s slowness" in unrelated endpoints without any single handler
 * looking slow. Event loop lag is the only signal that pinpoints this class
 * of issue.
 *
 * Cost: `monitorEventLoopDelay` is implemented in libuv as a histogram with
 * O(1) updates; the sampler runs once a minute and only logs above the
 * threshold. Effectively zero runtime overhead.
 */
export function startEventLoopMonitor(): void {
  const histogram = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
  histogram.enable();

  const timer = setInterval(() => {
    const p99Ms = histogram.percentile(99) / 1e6;
    if (p99Ms < WARN_P99_MS) {
      histogram.reset();
      return;
    }
    const mem = process.memoryUsage();
    logger.warn('[event-loop-lag]', {
      p50Ms: Math.round(histogram.percentile(50) / 1e6),
      p99Ms: Math.round(p99Ms),
      maxMs: Math.round(histogram.max / 1e6),
      sampleWindowSec: SAMPLE_INTERVAL_MS / 1000,
      uptimeSec: Math.round(process.uptime()),
      rssMB: Math.round(mem.rss / 1024 / 1024),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    });
    histogram.reset();
  }, SAMPLE_INTERVAL_MS);

  timer.unref();
}
