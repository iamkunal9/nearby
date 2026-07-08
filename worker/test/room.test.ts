import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("Worker routing", () => {
  it("rejects non-websocket requests with 426", async () => {
    const res = await SELF.fetch("https://example.com/room?peerId=abc&deviceName=Test");
    expect(res.status).toBe(426);
  });

  it("rejects websocket upgrade missing peerId", async () => {
    const res = await SELF.fetch("https://example.com/room", {
      headers: { Upgrade: "websocket" },
    });
    expect(res.status).toBe(400);
  });

  it("accepts a valid websocket upgrade and returns 101", async () => {
    const res = await SELF.fetch("https://example.com/room?peerId=abc&deviceName=Test", {
      headers: { Upgrade: "websocket", "CF-Connecting-IP": "203.0.113.5" },
    });
    expect(res.status).toBe(101);
    expect(res.webSocket).toBeDefined();
  });
});
