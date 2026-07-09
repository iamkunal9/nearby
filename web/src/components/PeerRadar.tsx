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

function peerPosition(peerId: string, index: number, count: number) {
  const angleStep = (2 * Math.PI) / count;
  const angleJitter = ((hashString(`${peerId}:angle`) % 1000) / 1000 - 0.5) * (angleStep * 0.4);
  const angle = index * angleStep + angleJitter - Math.PI / 2;
  const radiusJitter = ((hashString(`${peerId}:radius`) % 1000) / 1000 - 0.5) * 6;
  const radiusPct = 36 + radiusJitter;
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
  const [dragOverPeerId, setDragOverPeerId] = useState<string | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  function handleDrop(event: DragEvent<HTMLDivElement>, peer: PeerInfo) {
    event.preventDefault();
    setDragOverPeerId(null);
    const file = event.dataTransfer.files[0];
    if (file) onSendFile(peer, file);
  }

  function openTextDialog(peer: PeerInfo, clientX: number, clientY: number) {
    const dialogHalfWidth = 120;
    const margin = 12;
    const clampedX = Math.min(
      Math.max(clientX, dialogHalfWidth + margin),
      window.innerWidth - dialogHalfWidth - margin
    );
    // The note textarea autofocuses, which opens the on-screen keyboard on mobile
    // after this position is set. Bias toward the upper half of the screen so the
    // dialog stays clear of the keyboard once it appears.
    const clampedY = Math.min(clientY, window.innerHeight * 0.45);
    setTextDialogPeer(peer);
    setTextDialogPosition({ left: `${clampedX}px`, top: `${clampedY}px` });
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
    <div className="relative w-[min(88vw,380px)] sm:w-[min(66vmin,520px)] aspect-square mx-auto">
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: "radial-gradient(circle at 50% 50%, var(--canvas-raised) 0%, transparent 62%)" }}
      />

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 sm:gap-2 z-[2] select-none">
        <div
          className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-serif text-[15px] sm:text-[17px]"
          style={{ background: "var(--accent-wash)", border: "1.5px solid var(--accent)", color: "var(--accent-strong)" }}
        >
          {[0, 1.3, 2.6].map((delay) => (
            <span
              key={delay}
              className="absolute inset-0 rounded-full animate-scanpulse"
              style={{ border: "1px solid var(--accent)", animationDelay: `${delay}s` }}
            />
          ))}
          {myDeviceName.charAt(0)}
        </div>
        <p className="text-[9.5px] sm:text-[10.5px] tracking-[0.1em] uppercase" style={{ color: "var(--ink-faint)" }}>
          You
        </p>
        {peers.length === 0 && (
          <p className="text-[11px] sm:text-xs text-center mt-1 max-w-[160px] sm:max-w-none" style={{ color: "var(--ink-faint)" }}>
            Looking for devices on your network…
          </p>
        )}
      </div>

      {peers.map((peer, index) => {
        const position = peerPosition(peer.id, index, peers.length);
        const transfer = transfers[peer.id];
        const percent = transfer && transfer.fileSize > 0 ? transfer.bytesTransferred / transfer.fileSize : 0;
        const isComplete = transfer?.status === "complete";
        const isActive = transfer?.status === "in-progress";
        const isDragOver = dragOverPeerId === peer.id;

        let statusLabel = "On this network";
        if (isActive) statusLabel = `${transfer!.direction === "send" ? "Sending" : "Receiving"} — ${Math.round(percent * 100)}%`;
        else if (isComplete) statusLabel = transfer!.direction === "send" ? "Sent" : "Received";

        return (
          <div
            key={peer.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 sm:gap-2.5 cursor-pointer group z-[3] outline-none select-none touch-manipulation [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]"
            style={position}
            tabIndex={0}
            onClick={() => inputRefs.current.get(peer.id)?.click()}
            onContextMenu={(event) => handleContextMenu(event, peer)}
            onTouchStart={(event) => handleTouchStart(event, peer)}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOverPeerId(peer.id);
            }}
            onDragLeave={() => setDragOverPeerId(null)}
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
            <div className="relative w-14 h-14 sm:w-16 sm:h-16">
              <svg viewBox="0 0 64 64" className="absolute inset-0 w-14 h-14 sm:w-16 sm:h-16 -rotate-90">
                <circle cx="32" cy="32" r={RING_RADIUS} fill="none" stroke="var(--canvas-deep)" strokeWidth="3" />
                {(isActive || isComplete) && (
                  <circle
                    cx="32"
                    cy="32"
                    r={RING_RADIUS}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={RING_CIRCUMFERENCE * (1 - (isComplete ? 1 : percent))}
                  />
                )}
              </svg>
              <div
                className={`absolute inset-0 m-1.5 rounded-full flex items-center justify-center font-serif text-[18px] sm:text-[21px] bg-canvas-raised text-ink transition-[border-color,box-shadow,transform] duration-150 group-hover:-translate-y-0.5 group-hover:scale-105 group-hover:border-accent group-focus-visible:-translate-y-0.5 group-focus-visible:scale-105 group-focus-visible:border-accent group-focus-visible:[box-shadow:0_0_0_3px_var(--canvas),0_0_0_5px_var(--accent)] ${
                  isDragOver ? "border-accent [box-shadow:0_0_0_5px_var(--accent-wash)]" : "border-canvas-deep shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                }`}
                style={{ borderWidth: "1.5px", borderStyle: "solid" }}
              >
                {isComplete ? (
                  <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: "var(--accent)" }} fill="none">
                    <path
                      d="M5 12.5l4.5 4.5L19 7"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  peer.name.charAt(0)
                )}
              </div>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <p className="font-serif text-[13px] sm:text-[14.5px] text-center max-w-[92px] sm:max-w-[110px] leading-tight" style={{ color: "var(--ink)" }}>
                {peer.name}
              </p>
              <p
                className="text-[10.5px] sm:text-[11.5px] tabular-nums text-center"
                style={{ color: isActive || isComplete ? "var(--accent)" : "var(--ink-faint)" }}
              >
                {statusLabel}
              </p>
            </div>
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
