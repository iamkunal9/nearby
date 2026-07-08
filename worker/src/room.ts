import type { PeerInfo, ClientMessage, ServerMessage, SignalPayload } from "./protocol";

export interface Env {
  ROOM: DurableObjectNamespace;
}

interface Attachment {
  peerId: string;
  deviceName: string;
}

export class Room implements DurableObject {
  constructor(
    private state: DurableObjectState,
    private env: Env
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const url = new URL(request.url);
    const peerId = url.searchParams.get("peerId");
    const deviceName = url.searchParams.get("deviceName") ?? "Unknown device";
    if (!peerId) {
      return new Response("Missing peerId", { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server, [peerId]);
    server.serializeAttachment({ peerId, deviceName } satisfies Attachment);

    const existingPeers = this.listPeers().filter((p) => p.id !== peerId);
    this.send(server, { type: "peers", peers: existingPeers });
    this.broadcast({ type: "peer-joined", peer: { id: peerId, name: deviceName } }, peerId);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }
    if (parsed.type !== "signal") return;

    const targets = this.state.getWebSockets(parsed.target);
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (!attachment) return;

    const outgoing: ServerMessage = {
      type: "signal",
      from: attachment.peerId,
      data: parsed.data as SignalPayload,
    };
    for (const target of targets) {
      this.send(target, outgoing);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (!attachment) return;
    this.broadcast({ type: "peer-left", peerId: attachment.peerId }, attachment.peerId);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  private listPeers(): PeerInfo[] {
    return this.state.getWebSockets().map((ws) => {
      const attachment = ws.deserializeAttachment() as Attachment;
      return { id: attachment.peerId, name: attachment.deviceName };
    });
  }

  private broadcast(message: ServerMessage, excludePeerId: string): void {
    for (const ws of this.state.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as Attachment | null;
      if (attachment?.peerId === excludePeerId) continue;
      this.send(ws, message);
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    ws.send(JSON.stringify(message));
  }
}
