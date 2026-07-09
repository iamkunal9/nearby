import { describe, it, expect, vi, beforeEach } from "vitest";
import { CHUNK_SIZE, chunkCount, PeerConnection } from "../src/lib/webrtc";

class FakeDataChannel {
  binaryType = "";
  bufferedAmountLowThreshold = 0;
  bufferedAmount = 0;
  readyState = "open";
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
  onbufferedamountlow: (() => void) | null = null;
  sent: Array<string | ArrayBuffer> = [];
  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }
  close() {}
  addEventListener(type: string, listener: () => void) {
    if (type === "open") listener();
  }
}

class FakeRTCPeerConnection {
  static lastInstance: FakeRTCPeerConnection | null = null;
  lastDataChannel: FakeDataChannel | null = null;
  onicecandidate: ((event: { candidate: RTCIceCandidate | null }) => void) | null = null;
  ondatachannel: ((event: { channel: unknown }) => void) | null = null;
  constructor(_config?: unknown) {
    FakeRTCPeerConnection.lastInstance = this;
  }
  createDataChannel(_label: string) {
    this.lastDataChannel = new FakeDataChannel();
    return this.lastDataChannel;
  }
  createOffer() {
    return Promise.resolve({ sdp: "", type: "offer" });
  }
  createAnswer() {
    return Promise.resolve({ sdp: "", type: "answer" });
  }
  setLocalDescription() {
    return Promise.resolve();
  }
  setRemoteDescription() {
    return Promise.resolve();
  }
  addIceCandidate() {
    return Promise.resolve();
  }
  close() {}
}

beforeEach(() => {
  // @ts-expect-error test override
  globalThis.RTCPeerConnection = FakeRTCPeerConnection;
});

describe("chunking math", () => {
  it("computes exact chunk count for evenly divisible sizes", () => {
    expect(chunkCount(CHUNK_SIZE * 4, CHUNK_SIZE)).toBe(4);
  });

  it("rounds up for remainders", () => {
    expect(chunkCount(CHUNK_SIZE * 4 + 10, CHUNK_SIZE)).toBe(5);
  });

  it("handles files smaller than one chunk", () => {
    expect(chunkCount(100, CHUNK_SIZE)).toBe(1);
  });

  it("handles zero-byte files as zero chunks", () => {
    expect(chunkCount(0, CHUNK_SIZE)).toBe(0);
  });
});

describe("PeerConnection text messages", () => {
  it("sendText throws if the data channel was never created", async () => {
    const connection = new PeerConnection(() => {});
    await expect(connection.sendText("hello")).rejects.toThrow("Data channel not open");
  });

  it("routes an incoming text message to onTextReceived", async () => {
    const connection = new PeerConnection(() => {});
    await connection.createOffer();
    const channel = FakeRTCPeerConnection.lastInstance!.lastDataChannel!;

    const received: string[] = [];
    connection.onTextReceived = (text) => received.push(text);

    channel.onmessage!({ data: JSON.stringify({ type: "text", content: "hi" }) });

    expect(received).toEqual(["hi"]);
  });

  it("preserves MIME type through a file receive and ignores an interleaved text message mid-transfer", async () => {
    const connection = new PeerConnection(() => {});
    await connection.createOffer();
    const channel = FakeRTCPeerConnection.lastInstance!.lastDataChannel!;

    let receivedBlob: Blob | null = null;
    let receivedName = "";
    connection.onFileReceived = (blob, name) => {
      receivedBlob = blob;
      receivedName = name;
    };
    const texts: string[] = [];
    connection.onTextReceived = (text) => texts.push(text);

    channel.onmessage!({
      data: JSON.stringify({ type: "file-header", name: "a.png", size: 4, mimeType: "image/png" }),
    });
    channel.onmessage!({ data: JSON.stringify({ type: "text", content: "hello" }) });
    channel.onmessage!({ data: new Uint8Array([1, 2, 3, 4]).buffer });

    expect(texts).toEqual(["hello"]);
    expect(receivedName).toBe("a.png");
    expect(receivedBlob).not.toBeNull();
    expect(receivedBlob!.type).toBe("image/png");
    expect(receivedBlob!.size).toBe(4);
  });
});
