import { describe, it, expect, vi, beforeEach } from "vitest";
import { CHUNK_SIZE, chunkCount, PeerConnection } from "../src/lib/webrtc";

class FakeRTCPeerConnection {
  onicecandidate: ((event: { candidate: RTCIceCandidate | null }) => void) | null = null;
  ondatachannel: ((event: { channel: unknown }) => void) | null = null;
  constructor(_config?: unknown) {}
  createDataChannel(_label: string) {
    return {} as unknown;
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
});
