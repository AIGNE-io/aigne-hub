// Shim for @arcblock/ws - replaces WebSocket with SSE polling
type EventCallback = (...args: unknown[]) => void;

export class WsClient {
  private eventSource: EventSource | null = null;

  private listeners: Map<string, Set<EventCallback>> = new Map();

  private url: string;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(url: string, _options?: Record<string, unknown>) {
    this.url = url.replace(/^ws/, 'http').replace('/websocket', '/api/events');
  }

  connect() {
    if (this.eventSource) return;
    this.eventSource = new EventSource(this.url);
    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event && this.listeners.has(data.event)) {
          this.listeners.get(data.event)?.forEach((cb) => cb(data.payload));
        }
      } catch {
        // ignore parse errors
      }
    };
  }

  on(event: string, callback: EventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);
    if (!this.eventSource) this.connect();
  }

  off(event: string, callback: EventCallback) {
    this.listeners.get(event)?.delete(callback);
  }

  close() {
    this.eventSource?.close();
    this.eventSource = null;
  }
}

export class WsServer {
  // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-unused-vars
  broadcast(_event: string, _data: unknown) {
    // Server-side: no-op in frontend shim
  }

  // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-unused-vars
  attach(_server: unknown) {
    // no-op
  }
}
