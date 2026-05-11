import type { Response } from 'express';

import logger from './logger';

type Marks = Record<string, number>;

export interface RequestTimer {
  /**
   * Record the duration since the last mark (or since timer creation) under
   * `name`. Repeated marks with the same name accumulate.
   */
  mark(name: string): void;
  /**
   * Stop the timer, attach a `Server-Timing` header to the response, and emit
   * a structured info log. Must be called before the response body is sent so
   * the header is included in the flushed headers.
   */
  finalize(res: Response, meta?: Record<string, unknown>): { total: number } & Marks;
}

/**
 * Lightweight per-request timer. Designed for the slow analytics endpoints
 * where we want to know "how much of the latency was SQL vs JS reduce vs
 * formatting" without pulling in a tracing framework.
 *
 * Overhead is a handful of Date.now() calls plus one setHeader per request.
 */
export function createTimer(route: string): RequestTimer {
  const startedAt = Date.now();
  let lastMark = startedAt;
  const marks: Marks = {};

  return {
    mark(name: string) {
      const now = Date.now();
      marks[name] = (marks[name] || 0) + (now - lastMark);
      lastMark = now;
    },
    finalize(res, meta) {
      const total = Date.now() - startedAt;
      const headerValue = [
        ...Object.entries(marks).map(([name, dur]) => `${name};dur=${dur}`),
        `total;dur=${total}`,
      ].join(', ');
      if (!res.headersSent) {
        // Server-Timing is additive: preserve any value already set upstream.
        const existing = res.getHeader('Server-Timing');
        res.setHeader('Server-Timing', existing ? `${existing}, ${headerValue}` : headerValue);
      }
      logger.info('[handler.timing]', { route, total, ...marks, ...(meta || {}) });
      return { total, ...marks };
    },
  };
}
