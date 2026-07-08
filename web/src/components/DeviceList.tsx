import type { PeerInfo } from "../lib/protocol";

interface Props {
  peers: PeerInfo[];
  onSelect: (peer: PeerInfo) => void;
}

export function DeviceList({ peers, onSelect }: Props) {
  if (peers.length === 0) {
    return <p className="text-slate-400">Looking for devices on your network…</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {peers.map((peer) => (
        <li key={peer.id}>
          <button
            type="button"
            onClick={() => onSelect(peer)}
            className="w-full rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-3 text-left transition-colors"
          >
            {peer.name}
          </button>
        </li>
      ))}
    </ul>
  );
}
