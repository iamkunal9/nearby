import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "../src/store/useStore";

describe("useStore", () => {
  beforeEach(() => {
    useStore.setState({ peers: [], transfers: {} });
  });

  it("adds and removes peers", () => {
    useStore.getState().addPeer({ id: "a", name: "Phone" });
    expect(useStore.getState().peers).toEqual([{ id: "a", name: "Phone" }]);

    useStore.getState().removePeer("a");
    expect(useStore.getState().peers).toEqual([]);
  });

  it("upserts transfer progress", () => {
    useStore.getState().upsertTransfer({
      peerId: "a",
      fileName: "photo.png",
      fileSize: 1000,
      bytesTransferred: 0,
      direction: "send",
      status: "in-progress",
    });
    useStore.getState().upsertTransfer({
      peerId: "a",
      fileName: "photo.png",
      fileSize: 1000,
      bytesTransferred: 500,
      direction: "send",
      status: "in-progress",
    });
    expect(useStore.getState().transfers["a"].bytesTransferred).toBe(500);
  });
});
