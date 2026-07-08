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

interface Store {
  myPeerId: string;
  myDeviceName: string;
  peers: PeerInfo[];
  transfers: Record<string, TransferState>;
  setPeers: (peers: PeerInfo[]) => void;
  addPeer: (peer: PeerInfo) => void;
  removePeer: (peerId: string) => void;
  upsertTransfer: (transfer: TransferState) => void;
}

function randomDeviceName(): string {
  const adjectives = ["Swift", "Quiet", "Amber", "Cosmic", "Nimble"];
  const nouns = ["Falcon", "Otter", "Comet", "Maple", "Lynx"];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adjective} ${noun}`;
}

export const useStore = create<Store>((set) => ({
  myPeerId: crypto.randomUUID(),
  myDeviceName: randomDeviceName(),
  peers: [],
  transfers: {},
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
}));
