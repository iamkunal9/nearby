import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SignalingClient } from "../src/lib/signaling";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = FakeWebSocket.CONNECTING;
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
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
  triggerOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
  triggerUnexpectedClose() {
    this.readyState = FakeWebSocket.CLOSED;
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

describe("SignalingClient reconnect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("automatically reconnects after an unexpected close", () => {
    const client = new SignalingClient("wss://example.com/room", "peer-1", "Test Device");
    client.connect();
    FakeWebSocket.instances[0].triggerOpen();
    FakeWebSocket.instances[0].triggerUnexpectedClose();

    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("does not reconnect after an intentional close", () => {
    const client = new SignalingClient("wss://example.com/room", "peer-1", "Test Device");
    client.connect();
    FakeWebSocket.instances[0].triggerOpen();
    client.close();

    vi.advanceTimersByTime(15000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("reconnectNow immediately opens a new socket when not already open", () => {
    const client = new SignalingClient("wss://example.com/room", "peer-1", "Test Device");
    client.connect();
    FakeWebSocket.instances[0].triggerOpen();
    FakeWebSocket.instances[0].triggerUnexpectedClose();

    client.reconnectNow();
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("reconnectNow is a no-op when the socket is already open", () => {
    const client = new SignalingClient("wss://example.com/room", "peer-1", "Test Device");
    client.connect();
    FakeWebSocket.instances[0].triggerOpen();

    client.reconnectNow();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("isOpen reflects the underlying socket readyState", () => {
    const client = new SignalingClient("wss://example.com/room", "peer-1", "Test Device");
    client.connect();
    expect(client.isOpen()).toBe(false);

    FakeWebSocket.instances[0].triggerOpen();
    expect(client.isOpen()).toBe(true);
  });
});
