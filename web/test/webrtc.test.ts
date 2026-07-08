import { describe, it, expect } from "vitest";
import { CHUNK_SIZE, chunkCount } from "../src/lib/webrtc";

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
