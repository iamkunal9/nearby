import type { ClientMessage, ServerMessage } from "./protocol";

export class SignalingClient {
  private ws: WebSocket | null = null;
  onMessage: (message: ServerMessage) => void = () => {};
  onOpen: () => void = () => {};
  onClose: () => void = () => {};

  constructor(
    private baseUrl: string,
    private peerId: string,
    private deviceName: string
  ) {}

  connect(): void {
    const url = `${this.baseUrl}?peerId=${encodeURIComponent(this.peerId)}&deviceName=${encodeURIComponent(this.deviceName)}`;
    const ws = new WebSocket(url);
    ws.onopen = () => this.onOpen();
    ws.onclose = () => this.onClose();
    ws.onmessage = (event: MessageEvent<string>) => {
      const parsed = JSON.parse(event.data) as ServerMessage;
      this.onMessage(parsed);
    };
    this.ws = ws;
  }

  send(message: ClientMessage): void {
    this.ws?.send(JSON.stringify(message));
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
