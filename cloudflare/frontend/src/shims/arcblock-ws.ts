// Shim for @arcblock/ws - replaces WebSocket with SSE polling
type EventCallback = (...args: unknown[]) => void;

export class WsClient {
  private eventSource: EventSource | null = null;

  private listeners: Map<string, Set<EventCallback>> = new Map();

  private url: string;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(url: string, _options?: Record<string, unknown>) {
    // Original URL format: //host:port/prefix (no protocol, no /websocket)
    // Convert to SSE endpoint
    const base = url.startsWith('//') ? `${window.location.protocol}${url}` : url;
    this.url = `${base.replace(/\/$/, '')}/api/events`;
  }

  connect() {
    if (this.eventSource) return;
    try {
      this.eventSource = new EventSource(this.url);
    } catch {
      // EventSource connection failed, silently ignore
      return;
    }
    this.eventSource.onerror = () => {
      // Silently handle connection errors - SSE will auto-reconnect
      this.eventSource?.close();
      this.eventSource = null;
    };
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
