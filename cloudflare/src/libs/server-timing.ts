/**
 * Server-Timing utility for measuring request processing phases.
 *
 * Non-streaming: output via Server-Timing response header.
 * Streaming: output via SSE event (event: server-timing\ndata: ...\n\n).
 *
 * Phase names align with benchmarks/src/index.ts TIMING_PHASES:
 *   session, resolveProvider, modelCallCreate, preChecks, modelSetup,
 *   getCredentials, providerTtfb, ttfb, streaming, usage, modelStatus, total
 */

export class ServerTiming {
  private marks = new Map<string, number>();
  private durations = new Map<string, number>();
  private requestStart: number;

  constructor() {
    this.requestStart = performance.now();
  }

  /** Mark the start of a phase. */
  start(phase: string): void {
    this.marks.set(phase, performance.now());
  }

  /** End a phase and record its duration (ms). */
  end(phase: string): number {
    const startMark = this.marks.get(phase);
    if (startMark === undefined) return 0;
    const dur = performance.now() - startMark;
    this.durations.set(phase, dur);
    this.marks.delete(phase);
    return dur;
  }

  /** Record a duration directly (e.g. from an external measurement). */
  record(phase: string, durationMs: number): void {
    this.durations.set(phase, durationMs);
  }

  /** End the 'total' phase from request start. */
  finalize(): void {
    this.durations.set('total', performance.now() - this.requestStart);
  }

  /** Format as Server-Timing header value: "phase;dur=123.4,phase2;dur=56.7" */
  toHeader(): string {
    return Array.from(this.durations.entries())
      .map(([name, dur]) => `${name};dur=${dur.toFixed(1)}`)
      .join(',');
  }

  /** Format as SSE event for streaming responses. */
  toSSE(): string {
    return `event: server-timing\ndata: ${this.toHeader()}\n\n`;
  }

  /** Get duration of a specific phase (ms), or undefined if not recorded. */
  get(phase: string): number | undefined {
    return this.durations.get(phase);
  }
}
