import { describe, it, expect } from "vitest";
import { Room } from "../src/room";

function makeRoom(): Room {
  const state = {
    acceptWebSocket: () => {},
    getWebSockets: () => [],
  } as unknown as DurableObjectState;
  return new Room(state, {} as Env);
}

describe("Room signaling", () => {
  it("rejects non-websocket requests with 426", async () => {
    const room = makeRoom();
    const res = await room.fetch(new Request("https://example.com/room?peerId=abc&deviceName=Test"));
    expect(res.status).toBe(426);
  });

  it("rejects websocket upgrade missing peerId", async () => {
    const room = makeRoom();
    const res = await room.fetch(
      new Request("https://example.com/room", { headers: { Upgrade: "websocket" } })
    );
    expect(res.status).toBe(400);
  });
});
