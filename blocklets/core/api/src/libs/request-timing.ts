import type { NextFunction, Request, Response } from 'express';

import logger from './logger';

interface TimingEntry {
  start: number;
  end?: number;
  duration?: number;
}

export interface RequestTimings {
  /** Mark the start of a phase */
  start(phase: string): void;
  /** Mark the end of a phase, returns duration in ms */
  end(phase: string): number;
  /** Get all completed timings */
  getAll(): Record<string, number>;
  /** Get total elapsed time from request start */
  elapsed(): number;
}

declare global {
  namespace Express {
    interface Request {
      timings?: RequestTimings;
    }
  }
}

export function createRequestTimings(): RequestTimings {
  const entries = new Map<string, TimingEntry>();
  const requestStart = performance.now();

  return {
    start(phase: string) {
      entries.set(phase, { start: performance.now() });
    },
    end(phase: string): number {
      const entry = entries.get(phase);
      if (!entry) {
        logger.warn(`Timing phase "${phase}" was never started`);
        return 0;
      }
      entry.end = performance.now();
      entry.duration = Math.round((entry.end - entry.start) * 100) / 100;
      return entry.duration;
    },
    getAll() {
      const result: Record<string, number> = {};
      for (const [phase, entry] of entries) {
        if (entry.duration !== undefined) {
          result[phase] = entry.duration;
        }
      }
      return result;
    },
    elapsed() {
      return Math.round((performance.now() - requestStart) * 100) / 100;
    },
  };
}

/**
 * Middleware: attach timings to req and output Server-Timing header on finish
 *
 * Server-Timing is a standard HTTP header visible in Chrome DevTools Network tab.
 * Example output:
 *   Server-Timing: session;dur=12.3, provider;dur=28.1, aiCall;dur=1820.5
 */
export function requestTimingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const timings = createRequestTimings();
    req.timings = timings;

    // Auto-measure client-facing TTFB: from request arrival to first byte written to client.
    // This captures the full Hub processing time (session, preChecks, modelSetup/getCredentials,
    // provider call, etc.) before the client sees any data.
    timings.start('ttfb');
    let firstByteWritten = false;

    let timingHeaderWritten = false;

    const writeTimingHeader = () => {
      if (timingHeaderWritten || res.headersSent) return;
      timingHeaderWritten = true;
      const all = timings.getAll();
      const total = timings.elapsed();
      const parts = Object.entries(all).map(([phase, dur]) => `${phase};dur=${dur}`);
      parts.push(`total;dur=${total}`);
      res.setHeader('Server-Timing', parts.join(', '));
    };

    const markFirstByte = () => {
      if (!firstByteWritten) {
        firstByteWritten = true;
        timings.end('ttfb');
      }
    };

    // Intercept writeHead to inject Server-Timing before headers are flushed.
    // This is needed because compression() middleware sends headers before
    // our res.end wrapper runs, making res.headersSent already true.
    const originalWriteHead = res.writeHead;
    // @ts-ignore
    res.writeHead = function writeHeadWithTiming(...args: any[]) {
      writeTimingHeader();
      // @ts-ignore
      return originalWriteHead.apply(this, args);
    };

    const originalWrite = res.write;
    // @ts-ignore
    res.write = function resWriteWithTiming(...args: any[]) {
      markFirstByte();
      // @ts-ignore
      return originalWrite.apply(this, args);
    };

    const originalEnd = res.end;
    // @ts-ignore
    res.end = function resEndWithTiming(...args: any[]) {
      // Mark first byte for non-streaming responses (body sent via res.end directly)
      markFirstByte();
      // Fallback for routes without compression
      writeTimingHeader();

      // Structured log for aggregation/alerting
      const route = req.route?.path || req.path;
      logger.info('request-timing', {
        method: req.method,
        route,
        path: req.path,
        status: res.statusCode,
        model: req.body?.model,
        total: timings.elapsed(),
        phases: timings.getAll(),
      });

      // @ts-ignore
      return originalEnd.apply(this, args);
    };

    next();
  };
}
