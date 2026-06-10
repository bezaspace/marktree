import * as Y from "yjs";

export type ProviderStatus = "connecting" | "connected" | "disconnected";

export class MarktreeProvider {
  doc: Y.Doc;
  url: string;
  ws: WebSocket | null = null;
  initialized = false;
  status: ProviderStatus = "connecting";
  private _statusListeners = new Set<(s: ProviderStatus) => void>();

  constructor(doc: Y.Doc, url: string) {
    this.doc = doc;
    this.url = url;
    this.connect();
  }

  onStatusChange(cb: (s: ProviderStatus) => void) {
    this._statusListeners.add(cb);
    return () => this._statusListeners.delete(cb);
  }

  private setStatus(s: ProviderStatus) {
    this.status = s;
    this._statusListeners.forEach((cb) => cb(s));
  }

  connect() {
    if (this.ws) return;
    this.setStatus("connecting");
    this.ws = new WebSocket(this.url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      this.setStatus("connected");
    };

    this.ws.onmessage = (event) => {
      try {
        const update = new Uint8Array(event.data as ArrayBuffer);
        Y.applyUpdate(this.doc, update, this);
        if (!this.initialized) {
          this.initialized = true;
          this.setupSendHandler();
        }
      } catch {
        // ignore invalid messages
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.initialized = false;
      this.setStatus("disconnected");
      setTimeout(() => this.connect(), 2000);
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private setupSendHandler() {
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== this && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(update);
      }
    });
  }

  destroy() {
    this.ws?.close();
    this.ws = null;
  }
}
