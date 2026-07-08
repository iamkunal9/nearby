import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignalingClient } from "../src/lib/signaling";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.onclose?.();
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  // @ts-expect-error test override
  globalThis.WebSocket = FakeWebSocket;
});

describe("SignalingClient", () => {
  it("connects and forwards parsed messages", () => {
    const client = new SignalingClient("wss://example.com/room", "peer-1", "Test Device");
    const received: unknown[] = [];
    client.onMessage = (msg) => received.push(msg);
    client.connect();

    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toBe("wss://example.com/room?peerId=peer-1&deviceName=Test%20Device");

    ws.onmessage?.({ data: JSON.stringify({ type: "peers", peers: [] }) });
    expect(received).toEqual([{ type: "peers", peers: [] }]);
  });

  it("serializes outgoing messages as JSON", () => {
    const client = new SignalingClient("wss://example.com/room", "peer-1", "Test Device");
    client.connect();
    client.send({ type: "signal", target: "peer-2", data: { kind: "offer", sdp: "abc" } });

    const ws = FakeWebSocket.instances[0];
    expect(ws.sent).toEqual([
      JSON.stringify({ type: "signal", target: "peer-2", data: { kind: "offer", sdp: "abc" } }),
    ]);
  });
});
