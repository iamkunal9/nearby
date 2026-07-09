import { create } from "zustand";
import type { PeerInfo } from "../lib/protocol";

export interface TransferState {
  peerId: string;
  fileName: string;
  fileSize: number;
  bytesTransferred: number;
  direction: "send" | "receive";
  status: "in-progress" | "complete" | "failed";
}

export type ReceivedItem =
  | { kind: "file"; blob: Blob; name: string; peerName: string }
  | { kind: "text"; content: string; peerName: string };

const AUTO_DOWNLOAD_KEY = "p2p-auto-download";

interface Store {
  myPeerId: string;
  myDeviceName: string;
  peers: PeerInfo[];
  transfers: Record<string, TransferState>;
  receiveQueue: ReceivedItem[];
  autoDownload: boolean;
  setPeers: (peers: PeerInfo[]) => void;
  addPeer: (peer: PeerInfo) => void;
  removePeer: (peerId: string) => void;
  upsertTransfer: (transfer: TransferState) => void;
  enqueueReceived: (item: ReceivedItem) => void;
  dequeueReceived: () => void;
  setAutoDownload: (value: boolean) => void;
}

function randomDeviceName(): string {
  const adjectives = ["Swift", "Quiet", "Amber", "Cosmic", "Nimble"];
  const nouns = ["Falcon", "Otter", "Comet", "Maple", "Lynx"];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adjective} ${noun}`;
}

function readAutoDownload(): boolean {
  return localStorage.getItem(AUTO_DOWNLOAD_KEY) === "true";
}

export const useStore = create<Store>((set) => ({
  myPeerId: crypto.randomUUID(),
  myDeviceName: randomDeviceName(),
  peers: [],
  transfers: {},
  receiveQueue: [],
  autoDownload: readAutoDownload(),
  setPeers: (peers) => set({ peers }),
  addPeer: (peer) =>
    set((state) => ({
      peers: state.peers.some((p) => p.id === peer.id) ? state.peers : [...state.peers, peer],
    })),
  removePeer: (peerId) =>
    set((state) => ({ peers: state.peers.filter((p) => p.id !== peerId) })),
  upsertTransfer: (transfer) =>
    set((state) => ({
      transfers: { ...state.transfers, [transfer.peerId]: transfer },
    })),
  enqueueReceived: (item) =>
    set((state) => ({ receiveQueue: [...state.receiveQueue, item] })),
  dequeueReceived: () =>
    set((state) => ({ receiveQueue: state.receiveQueue.slice(1) })),
  setAutoDownload: (value) => {
    localStorage.setItem(AUTO_DOWNLOAD_KEY, String(value));
    set({ autoDownload: value });
  },
}));
