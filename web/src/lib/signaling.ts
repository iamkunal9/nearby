import type { ClientMessage, ServerMessage } from "./protocol";

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 10000;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private intentionalClose = false;
  private reconnectTimer: number | null = null;
  private reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;

  onMessage: (message: ServerMessage) => void = () => {};
  onOpen: () => void = () => {};
  onClose: () => void = () => {};

  constructor(
    private baseUrl: string,
    private peerId: string,
    private deviceName: string
  ) {}

  connect(): void {
    this.intentionalClose = false;
    this.openSocket();
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  reconnectNow(): void {
    if (this.isOpen() || this.intentionalClose) return;
    this.clearReconnectTimer();
    this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
    this.openSocket();
  }

  send(message: ClientMessage): void {
    this.ws?.send(JSON.stringify(message));
  }

  close(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    this.ws?.close();
    this.ws = null;
  }

  private openSocket(): void {
    const url = `${this.baseUrl}?peerId=${encodeURIComponent(this.peerId)}&deviceName=${encodeURIComponent(this.deviceName)}`;
    const ws = new WebSocket(url);
    ws.onopen = () => {
      this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
      this.onOpen();
    };
    ws.onclose = () => {
      this.onClose();
      if (!this.intentionalClose) this.scheduleReconnect();
    };
    ws.onmessage = (event: MessageEvent<string>) => {
      const parsed = JSON.parse(event.data) as ServerMessage;
      this.onMessage(parsed);
    };
    this.ws = ws;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, this.reconnectDelayMs);
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
