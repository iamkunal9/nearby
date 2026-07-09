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

describe("useStore receive queue and auto-download", () => {
  beforeEach(() => {
    useStore.setState({ receiveQueue: [], autoDownload: false });
    localStorage.clear();
  });

  it("enqueues and dequeues received items in order", () => {
    useStore.getState().enqueueReceived({ kind: "text", content: "hi", peerName: "Otter" });
    useStore.getState().enqueueReceived({ kind: "text", content: "bye", peerName: "Otter" });
    expect(useStore.getState().receiveQueue).toHaveLength(2);

    useStore.getState().dequeueReceived();
    expect(useStore.getState().receiveQueue).toEqual([{ kind: "text", content: "bye", peerName: "Otter" }]);
  });

  it("persists autoDownload to localStorage", () => {
    useStore.getState().setAutoDownload(true);
    expect(useStore.getState().autoDownload).toBe(true);
    expect(localStorage.getItem("p2p-auto-download")).toBe("true");
  });
});
