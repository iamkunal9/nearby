import { useRef, useState, type DragEvent, type MouseEvent, type TouchEvent } from "react";
import type { PeerInfo } from "../lib/protocol";
import type { TransferState } from "../store/useStore";
import { TextDialog } from "./TextDialog";

interface Props {
  myDeviceName: string;
  peers: PeerInfo[];
  transfers: Record<string, TransferState>;
  onSendFile: (peer: PeerInfo, file: File) => void;
  onSendText: (peer: PeerInfo, text: string) => void;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function peerColor(peerId: string): string {
  return `hsl(${hashString(peerId) % 360}, 65%, 55%)`;
}

function peerPosition(peerId: string, index: number, count: number) {
  const angleStep = (2 * Math.PI) / count;
  const angleJitter = ((hashString(`${peerId}:angle`) % 1000) / 1000 - 0.5) * (angleStep * 0.4);
  const angle = index * angleStep + angleJitter - Math.PI / 2;
  const radiusJitter = ((hashString(`${peerId}:radius`) % 1000) / 1000 - 0.5) * 6;
  const radiusPct = 34 + radiusJitter;
  return {
    left: `${50 + radiusPct * Math.cos(angle)}%`,
    top: `${50 + radiusPct * Math.sin(angle)}%`,
  };
}

const RING_RADIUS = 26;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const LONG_PRESS_MS = 610;
const LONG_PRESS_MOVE_TOLERANCE = 10;

export function PeerRadar({ myDeviceName, peers, transfers, onSendFile, onSendText }: Props) {
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const [textDialogPeer, setTextDialogPeer] = useState<PeerInfo | null>(null);
  const [textDialogPosition, setTextDialogPosition] = useState({ left: "50%", top: "50%" });
  const longPressTimer = useRef<number | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  function handleDrop(event: DragEvent<HTMLDivElement>, peer: PeerInfo) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) onSendFile(peer, file);
  }

  function openTextDialog(peer: PeerInfo, clientX: number, clientY: number) {
    setTextDialogPeer(peer);
    setTextDialogPosition({ left: `${clientX}px`, top: `${clientY}px` });
  }

  function handleContextMenu(event: MouseEvent<HTMLDivElement>, peer: PeerInfo) {
    event.preventDefault();
    openTextDialog(peer, event.clientX, event.clientY);
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>, peer: PeerInfo) {
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
    longPressTimer.current = window.setTimeout(() => {
      openTextDialog(peer, touch.clientX, touch.clientY);
    }, LONG_PRESS_MS);
  }

  function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (!touchStart.current || longPressTimer.current === null) return;
    const touch = event.touches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handleTouchEnd() {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStart.current = null;
  }

  return (
    <div className="relative w-[min(85vw,85vh,560px)] aspect-square mx-auto">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
        <div className="w-24 h-24 rounded-full bg-sky-500/20 border-2 border-sky-400 animate-pulse flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-sky-500/40" />
        </div>
        <p className="text-slate-300 text-sm text-center">You are: {myDeviceName}</p>
        {peers.length === 0 && (
          <p className="text-slate-500 text-xs text-center">Looking for devices on your network…</p>
        )}
      </div>

      {peers.map((peer, index) => {
        const position = peerPosition(peer.id, index, peers.length);
        const transfer = transfers[peer.id];
        const percent = transfer && transfer.fileSize > 0 ? transfer.bytesTransferred / transfer.fileSize : 0;
        const isComplete = transfer?.status === "complete";
        const isActive = transfer?.status === "in-progress";

        return (
          <div
            key={peer.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 cursor-pointer group"
            style={position}
            onClick={() => inputRefs.current.get(peer.id)?.click()}
            onContextMenu={(event) => handleContextMenu(event, peer)}
            onTouchStart={(event) => handleTouchStart(event, peer)}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleDrop(event, peer)}
          >
            <input
              ref={(el) => {
                if (el) inputRefs.current.set(peer.id, el);
                else inputRefs.current.delete(peer.id);
              }}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onSendFile(peer, file);
                event.target.value = "";
              }}
            />
            <div className="relative w-16 h-16">
              <svg viewBox="0 0 64 64" className="absolute inset-0 w-16 h-16 -rotate-90">
                <circle
                  cx="32"
                  cy="32"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="rgba(148, 163, 184, 0.25)"
                  strokeWidth="3"
                />
                {(isActive || isComplete) && (
                  <circle
                    cx="32"
                    cy="32"
                    r={RING_RADIUS}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={RING_CIRCUMFERENCE * (1 - (isComplete ? 1 : percent))}
                  />
                )}
              </svg>
              <div
                className="absolute inset-0 m-1.5 rounded-full flex items-center justify-center text-white font-semibold animate-breathe group-hover:scale-110 transition-transform"
                style={{ backgroundColor: peerColor(peer.id) }}
              >
                {isComplete ? "✓" : peer.name.charAt(0)}
              </div>
            </div>
            <p className="text-slate-300 text-xs text-center max-w-[80px]">{peer.name}</p>
          </div>
        );
      })}

      {textDialogPeer && (
        <TextDialog
          peerName={textDialogPeer.name}
          position={textDialogPosition}
          onSend={(text) => onSendText(textDialogPeer, text)}
          onClose={() => setTextDialogPeer(null)}
        />
      )}
    </div>
  );
}
