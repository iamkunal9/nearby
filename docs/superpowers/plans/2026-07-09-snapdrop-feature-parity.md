# SnapDrop Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add text messaging (right-click/long-press a peer), a receive dialog with file preview and auto-download toggle, browser notifications + sound on receipt, and paste-to-send for clipboard images — bringing the app to feature parity with SnapDrop's real behavior.

**Architecture:** Text messages travel over the existing `RTCDataChannel` alongside file chunks, using a second string-message discriminator (`{type:"text"}` next to the existing `{type:"file-header"}`). No signaling/worker changes. All other features are new frontend-only components and store state.

**Tech Stack:** Same as the base app — React 19, TypeScript, Tailwind, Zustand, WebRTC. New: Web Audio API for the notification sound (no binary asset), Notification API for browser notifications, `navigator.clipboard`/paste events for paste-to-send.

## Global Constraints

- No worker/signaling protocol changes — this is a frontend-only feature set.
- Long-press threshold for mobile text-dialog trigger: **610ms** (matches SnapDrop exactly), with a small movement-cancel threshold so a drag isn't misread as a long-press.
- Paste-to-send only sends when **exactly one** peer is visible (`peers.length === 1`); zero or multiple peers is a silent no-op, per the design decision — no toast needed for that case.
- `autoDownload` preference persists to `localStorage` key `p2p-auto-download`; text always shows the receive dialog regardless of this setting (there's no non-interactive path for text).
- Notifications only fire when `document.hidden` is true; the notification-sound plays on every receipt regardless of tab visibility.
- Git commits must NOT include any author/co-author attribution beyond the repo owner (`iamkunal9`) — no `Co-Authored-By` trailers. Use exactly: `git -c user.name="iamkunal9" -c user.email="x-research@credshields.com" commit -m "..."`.

---

## File Structure

```
web/src/
├── lib/
│   ├── webrtc.ts            # MODIFY: add sendText, onTextReceived, extend handleIncoming
│   ├── protocol.ts           # unchanged
│   └── notifications.ts      # NEW: requestNotificationPermission, notifyReceived, playBlop
├── store/
│   └── useStore.ts           # MODIFY: add receiveQueue, autoDownload, enqueueReceived, dequeueReceived, setAutoDownload
├── components/
│   ├── PeerRadar.tsx         # MODIFY: add onContextMenu + long-press handlers, onOpenTextDialog prop
│   ├── TextDialog.tsx        # NEW: send-text popover
│   └── ReceiveDialog.tsx     # NEW: receive queue modal (file preview/download, text display/copy)
└── App.tsx                   # MODIFY: wire text send/receive, receive queue, paste listener, notification button
```

---

### Task 1: Channel protocol extension — text messages in `webrtc.ts`

**Files:**
- Modify: `web/src/lib/webrtc.ts`
- Test: `web/test/webrtc.test.ts`

**Interfaces:**
- Consumes: nothing new (extends the existing `PeerConnection` class in place).
- Produces: `PeerConnection.sendText(text: string): Promise<void>`, `PeerConnection.onTextReceived: (text: string) => void` — consumed by `App.tsx` (Task 5) and `TextDialog.tsx` (Task 3, indirectly via App's handler).

- [ ] **Step 1: Write the failing test for the text-message discriminator**

Add to `web/test/webrtc.test.ts` (the file already has 4 `chunkCount` tests — add this describe block alongside them, don't remove the existing ones):

```typescript
import { describe, it, expect, vi } from "vitest";
import { CHUNK_SIZE, chunkCount, PeerConnection } from "../src/lib/webrtc";

// ... existing chunkCount describe block stays unchanged ...

describe("PeerConnection text messages", () => {
  it("sendText throws if the data channel was never created", async () => {
    const connection = new PeerConnection(() => {});
    await expect(connection.sendText("hello")).rejects.toThrow("Data channel not open");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm test`
Expected: FAIL — `sendText` does not exist on `PeerConnection`.

- [ ] **Step 3: Implement the text-message extension in `web/src/lib/webrtc.ts`**

Replace the `FileHeader` interface and everything below it with:

```typescript
interface FileHeader {
  type: "file-header";
  name: string;
  size: number;
}

interface TextMessage {
  type: "text";
  content: string;
}

type ChannelStringMessage = FileHeader | TextMessage;

export class PeerConnection {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private channelOpen: Promise<void> | null = null;
  private incomingChunks: ArrayBuffer[] = [];
  private incomingHeader: FileHeader | null = null;
  private incomingBytes = 0;

  onFileReceived: (file: Blob, name: string) => void = () => {};
  onProgress: (bytesReceived: number, totalBytes: number) => void = () => {};
  onTextReceived: (text: string) => void = () => {};

  constructor(private onIceCandidate: (candidate: RTCIceCandidateInit) => void) {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc.onicecandidate = (event) => {
      if (event.candidate) this.onIceCandidate(event.candidate.toJSON());
    };
    this.pc.ondatachannel = (event) => {
      this.attachChannel(event.channel);
    };
  }

  async createOffer(): Promise<string> {
    this.attachChannel(this.pc.createDataChannel("file-transfer"));
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer.sdp!;
  }

  async acceptOffer(sdp: string): Promise<string> {
    await this.pc.setRemoteDescription({ type: "offer", sdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer.sdp!;
  }

  async acceptAnswer(sdp: string): Promise<void> {
    await this.pc.setRemoteDescription({ type: "answer", sdp });
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    await this.pc.addIceCandidate(candidate);
  }

  async sendText(text: string): Promise<void> {
    const channel = this.channel;
    if (!channel) throw new Error("Data channel not open");
    await this.channelOpen;

    const message: TextMessage = { type: "text", content: text };
    channel.send(JSON.stringify(message));
  }

  async sendFile(file: File, onProgress: (bytesSent: number) => void): Promise<void> {
    const channel = this.channel;
    if (!channel) throw new Error("Data channel not open");
    await this.channelOpen;

    const header: FileHeader = { type: "file-header", name: file.name, size: file.size };
    channel.send(JSON.stringify(header));

    let offset = 0;
    while (offset < file.size) {
      if (channel.bufferedAmount > BUFFERED_AMOUNT_LOW_THRESHOLD) {
        await new Promise<void>((resolve) => {
          channel.onbufferedamountlow = () => {
            channel.onbufferedamountlow = null;
            resolve();
          };
        });
      }
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const buffer = await slice.arrayBuffer();
      channel.send(buffer);
      offset += buffer.byteLength;
      onProgress(offset);
    }
  }

  close(): void {
    this.channel?.close();
    this.pc.close();
  }

  private attachChannel(channel: RTCDataChannel): void {
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;
    channel.onmessage = (event) => this.handleIncoming(event.data);
    this.channel = channel;
    this.channelOpen =
      channel.readyState === "open"
        ? Promise.resolve()
        : new Promise((resolve) => {
            channel.addEventListener("open", () => resolve(), { once: true });
          });
  }

  private handleIncoming(data: string | ArrayBuffer): void {
    if (typeof data === "string") {
      const message = JSON.parse(data) as ChannelStringMessage;
      if (message.type === "text") {
        this.onTextReceived(message.content);
        return;
      }
      this.incomingHeader = message;
      this.incomingChunks = [];
      this.incomingBytes = 0;
      return;
    }

    this.incomingChunks.push(data);
    this.incomingBytes += data.byteLength;
    const header = this.incomingHeader;
    if (!header) return;

    this.onProgress(this.incomingBytes, header.size);
    if (this.incomingBytes >= header.size) {
      const blob = new Blob(this.incomingChunks);
      this.onFileReceived(blob, header.name);
      this.incomingChunks = [];
      this.incomingHeader = null;
      this.incomingBytes = 0;
    }
  }
}
```

Note: `chunkCount`, `CHUNK_SIZE`, `BUFFERED_AMOUNT_LOW_THRESHOLD`, and `ICE_SERVERS` at the top of the file are unchanged — only the `FileHeader`-and-below section changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && pnpm test`
Expected: PASS — all existing `chunkCount` tests plus the new `sendText` test are green.

- [ ] **Step 5: Run tsc to confirm no type errors**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/webrtc.ts web/test/webrtc.test.ts
git -c user.name="iamkunal9" -c user.email="x-research@credshields.com" commit -m "Add text message support to the WebRTC data channel protocol"
```

---

### Task 2: Store additions — receive queue, auto-download preference

**Files:**
- Modify: `web/src/store/useStore.ts`
- Test: `web/test/useStore.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ReceivedItem` type (`{kind:"file"; blob: Blob; name: string; peerName: string} | {kind:"text"; content: string; peerName: string}`), store fields `receiveQueue: ReceivedItem[]`, `autoDownload: boolean`, actions `enqueueReceived(item: ReceivedItem): void`, `dequeueReceived(): void`, `setAutoDownload(value: boolean): void` — consumed by `App.tsx` (Task 5) and `ReceiveDialog.tsx` (Task 4).

- [ ] **Step 1: Write the failing tests**

Add to `web/test/useStore.test.ts` (existing tests stay — add this block):

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm test`
Expected: FAIL — `receiveQueue`, `enqueueReceived`, `dequeueReceived`, `setAutoDownload` don't exist on the store yet.

- [ ] **Step 3: Implement the store additions in `web/src/store/useStore.ts`**

Replace the full file content with:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && pnpm test`
Expected: PASS.

- [ ] **Step 5: Run tsc to confirm no type errors**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add web/src/store/useStore.ts web/test/useStore.test.ts
git -c user.name="iamkunal9" -c user.email="x-research@credshields.com" commit -m "Add receive queue and auto-download preference to the store"
```

---

### Task 3: Text send popover — `TextDialog.tsx`

**Files:**
- Create: `web/src/components/TextDialog.tsx`

**Interfaces:**
- Consumes: nothing project-specific (plain React component).
- Produces: `TextDialog` component with props `{ peerName: string; position: { left: string; top: string }; onSend: (text: string) => void; onClose: () => void }` — consumed by `PeerRadar.tsx` (Task 4, renders it) driven by `App.tsx` (Task 5, owns open/close state and the `onSend` handler).

- [ ] **Step 1: Implement `web/src/components/TextDialog.tsx`**

```typescript
import { useEffect, useRef, useState } from "react";

interface Props {
  peerName: string;
  position: { left: string; top: string };
  onSend: (text: string) => void;
  onClose: () => void;
}

export function TextDialog({ peerName, position, onSend, onClose }: Props) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleSend() {
    if (text.trim().length === 0) return;
    onSend(text);
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 -translate-x-1/2 flex flex-col gap-2 bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl w-64"
        style={position}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-slate-300 text-xs">Send text to {peerName}</p>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          className="bg-slate-900 text-white text-sm rounded p-2 resize-none h-20 outline-none border border-slate-700 focus:border-sky-400"
        />
        <button
          type="button"
          onClick={handleSend}
          className="bg-sky-500 hover:bg-sky-400 text-white text-sm rounded py-1.5 transition-colors"
        >
          Send
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Run tsc to confirm no type errors**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add web/src/components/TextDialog.tsx
git -c user.name="iamkunal9" -c user.email="x-research@credshields.com" commit -m "Add TextDialog component for sending text to a peer"
```

---

### Task 4: Receive dialog — `ReceiveDialog.tsx`

**Files:**
- Create: `web/src/components/ReceiveDialog.tsx`

**Interfaces:**
- Consumes: `ReceivedItem` type from `web/src/store/useStore.ts` (Task 2).
- Produces: `ReceiveDialog` component with props `{ item: ReceivedItem; onDismiss: () => void }` — consumed by `App.tsx` (Task 5), which renders it when `receiveQueue[0]` exists.

- [ ] **Step 1: Implement `web/src/components/ReceiveDialog.tsx`**

```typescript
import { useEffect, useState } from "react";
import type { ReceivedItem } from "../store/useStore";

interface Props {
  item: ReceivedItem;
  onDismiss: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isUrl(text: string): boolean {
  try {
    const url = new URL(text.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function ReceiveDialog({ item, onDismiss }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (item.kind === "file" && item.blob.type.startsWith("image/")) {
      const url = URL.createObjectURL(item.blob);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [item]);

  useEffect(() => {
    if (item.kind === "text" && !isUrl(item.content)) {
      navigator.clipboard.writeText(item.content).then(() => setCopied(true));
    }
  }, [item]);

  function handleDownload() {
    if (item.kind !== "file") return;
    const url = URL.createObjectURL(item.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.name;
    a.click();
    URL.revokeObjectURL(url);
    onDismiss();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-5 w-80 flex flex-col gap-3">
        <p className="text-slate-300 text-xs">From {item.peerName}</p>

        {item.kind === "file" && (
          <>
            {previewUrl && <img src={previewUrl} alt={item.name} className="rounded max-h-40 object-contain" />}
            <p className="text-white text-sm break-all">{item.name}</p>
            <p className="text-slate-400 text-xs">{formatBytes(item.blob.size)}</p>
            <button
              type="button"
              onClick={handleDownload}
              className="bg-sky-500 hover:bg-sky-400 text-white text-sm rounded py-1.5 transition-colors"
            >
              Download
            </button>
          </>
        )}

        {item.kind === "text" && (
          <>
            {isUrl(item.content) ? (
              <a
                href={item.content.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 text-sm break-all underline"
              >
                {item.content}
              </a>
            ) : (
              <p className="text-white text-sm break-all whitespace-pre-wrap">{item.content}</p>
            )}
            {copied && <p className="text-emerald-400 text-xs">Copied to clipboard</p>}
          </>
        )}

        <button
          type="button"
          onClick={onDismiss}
          className="text-slate-400 hover:text-slate-200 text-xs"
        >
          Close
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run tsc to confirm no type errors**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add web/src/components/ReceiveDialog.tsx
git -c user.name="iamkunal9" -c user.email="x-research@credshields.com" commit -m "Add ReceiveDialog component for incoming files and text"
```

---

### Task 5: Notifications + sound helper

**Files:**
- Create: `web/src/lib/notifications.ts`
- Test: `web/test/notifications.test.ts`

**Interfaces:**
- Consumes: nothing project-specific.
- Produces: `requestNotificationPermission(): Promise<void>`, `notifyReceived(title: string, body: string): void`, `playBlop(): void` — consumed by `App.tsx` (Task 6).

- [ ] **Step 1: Write the failing test**

```typescript
// web/test/notifications.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { notifyReceived } from "../src/lib/notifications";

describe("notifyReceived", () => {
  beforeEach(() => {
    vi.stubGlobal("Notification", class {
      static permission = "granted";
      constructor(public title: string, public options?: NotificationOptions) {}
    });
  });

  it("does not create a Notification when the tab is visible", () => {
    const spy = vi.spyOn(globalThis, "Notification");
    Object.defineProperty(document, "hidden", { value: false, configurable: true });

    notifyReceived("Test", "body");

    expect(spy).not.toHaveBeenCalled();
  });

  it("creates a Notification when the tab is hidden and permission is granted", () => {
    const spy = vi.spyOn(globalThis, "Notification");
    Object.defineProperty(document, "hidden", { value: true, configurable: true });

    notifyReceived("Test", "body");

    expect(spy).toHaveBeenCalledWith("Test", { body: "body" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm test`
Expected: FAIL — `../src/lib/notifications` not found.

- [ ] **Step 3: Implement `web/src/lib/notifications.ts`**

```typescript
export async function requestNotificationPermission(): Promise<void> {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
}

export function notifyReceived(title: string, body: string): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  if (!document.hidden) return;
  new Notification(title, { body });
}

export function playBlop(): void {
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  const ctx = new AudioCtx();
  const now = ctx.currentTime;

  [660, 880].forEach((frequency, index) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    gain.connect(ctx.destination);

    const start = now + index * 0.09;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.2, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.08);

    oscillator.start(start);
    oscillator.stop(start + 0.09);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && pnpm test`
Expected: PASS.

- [ ] **Step 5: Run tsc to confirm no type errors**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/notifications.ts web/test/notifications.test.ts
git -c user.name="iamkunal9" -c user.email="x-research@credshields.com" commit -m "Add browser notification and sound helpers for message/file receipt"
```

---

### Task 6: `PeerRadar.tsx` — right-click and long-press to open TextDialog

**Files:**
- Modify: `web/src/components/PeerRadar.tsx`

**Interfaces:**
- Consumes: `TextDialog` from `web/src/components/TextDialog.tsx` (Task 3).
- Produces: `PeerRadar` gains a new prop `onSendText: (peer: PeerInfo, text: string) => void` — consumed by `App.tsx` (Task 7). The component now owns which peer's `TextDialog` (if any) is open, as local state — `App.tsx` does not need to track this.

- [ ] **Step 1: Replace `web/src/components/PeerRadar.tsx` with the extended version**

```typescript
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
```

- [ ] **Step 2: Run tsc to confirm no type errors**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add web/src/components/PeerRadar.tsx
git -c user.name="iamkunal9" -c user.email="x-research@credshields.com" commit -m "Add right-click and long-press text dialog trigger to PeerRadar"
```

---

### Task 7: Wire everything into `App.tsx`

**Files:**
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `ReceiveDialog` (Task 4), `notifyReceived`/`playBlop`/`requestNotificationPermission` (Task 5), `PeerRadar`'s new `onSendText` prop (Task 6), store's `receiveQueue`/`autoDownload`/`enqueueReceived`/`dequeueReceived`/`setAutoDownload` (Task 2), `PeerConnection.sendText`/`onTextReceived` (Task 1).
- Produces: fully wired `App` component — the deliverable manually verified in Task 8.

- [ ] **Step 1: Replace `web/src/App.tsx` with the wired version**

```typescript
import { useEffect, useRef } from "react";
import { useStore } from "./store/useStore";
import { SignalingClient } from "./lib/signaling";
import { PeerConnection } from "./lib/webrtc";
import { notifyReceived, playBlop, requestNotificationPermission } from "./lib/notifications";
import { PeerRadar } from "./components/PeerRadar";
import { ReceiveDialog } from "./components/ReceiveDialog";
import type { PeerInfo } from "./lib/protocol";

const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL ?? "ws://localhost:8787/room";

export default function App() {
  const {
    myPeerId,
    myDeviceName,
    peers,
    transfers,
    receiveQueue,
    autoDownload,
    setPeers,
    addPeer,
    removePeer,
    upsertTransfer,
    enqueueReceived,
    dequeueReceived,
    setAutoDownload,
  } = useStore();
  const signalingRef = useRef<SignalingClient | null>(null);
  const connectionsRef = useRef<Map<string, PeerConnection>>(new Map());
  const peersRef = useRef<PeerInfo[]>(peers);
  peersRef.current = peers;
  const autoDownloadRef = useRef(autoDownload);
  autoDownloadRef.current = autoDownload;

  useEffect(() => {
    const client = new SignalingClient(SIGNALING_URL, myPeerId, myDeviceName);
    signalingRef.current = client;

    client.onMessage = (message) => {
      if (message.type === "peers") setPeers(message.peers);
      if (message.type === "peer-joined") addPeer(message.peer);
      if (message.type === "peer-left") removePeer(message.peerId);
      if (message.type === "signal") {
        void handleSignal(message.from, message.data);
      }
    };

    client.connect();
    return () => client.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      if (peersRef.current.length !== 1) return;
      const item = Array.from(event.clipboardData?.items ?? []).find((entry) => entry.type.startsWith("image/"));
      if (!item) return;
      const file = item.getAsFile();
      if (!file) return;
      void handleSendFile(peersRef.current[0], file);
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function peerNameFor(peerId: string): string {
    return peersRef.current.find((peer) => peer.id === peerId)?.name ?? "Unknown device";
  }

  function getOrCreateConnection(peerId: string): PeerConnection {
    const existing = connectionsRef.current.get(peerId);
    if (existing) return existing;

    const connection = new PeerConnection((candidate) => {
      signalingRef.current?.send({
        type: "signal",
        target: peerId,
        data: { kind: "ice-candidate", candidate },
      });
    });
    connection.onFileReceived = (blob, name) => {
      playBlop();
      notifyReceived("File received", `${name} from ${peerNameFor(peerId)}`);
      if (autoDownloadRef.current) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      enqueueReceived({ kind: "file", blob, name, peerName: peerNameFor(peerId) });
    };
    connection.onProgress = (received, total) => {
      upsertTransfer({
        peerId,
        fileName: "incoming file",
        fileSize: total,
        bytesTransferred: received,
        direction: "receive",
        status: received >= total ? "complete" : "in-progress",
      });
    };
    connection.onTextReceived = (text) => {
      playBlop();
      notifyReceived("Text received", `From ${peerNameFor(peerId)}`);
      enqueueReceived({ kind: "text", content: text, peerName: peerNameFor(peerId) });
    };

    connectionsRef.current.set(peerId, connection);
    return connection;
  }

  async function handleSignal(fromPeerId: string, data: import("./lib/protocol").SignalPayload) {
    const connection = getOrCreateConnection(fromPeerId);
    if (data.kind === "offer") {
      const answerSdp = await connection.acceptOffer(data.sdp);
      signalingRef.current?.send({ type: "signal", target: fromPeerId, data: { kind: "answer", sdp: answerSdp } });
    } else if (data.kind === "answer") {
      await connection.acceptAnswer(data.sdp);
    } else if (data.kind === "ice-candidate") {
      await connection.addIceCandidate(data.candidate);
    }
  }

  async function handleSendFile(peer: PeerInfo, file: File) {
    const connection = getOrCreateConnection(peer.id);
    const offerSdp = await connection.createOffer();
    signalingRef.current?.send({ type: "signal", target: peer.id, data: { kind: "offer", sdp: offerSdp } });

    await connection.sendFile(file, (bytesSent) => {
      upsertTransfer({
        peerId: peer.id,
        fileName: file.name,
        fileSize: file.size,
        bytesTransferred: bytesSent,
        direction: "send",
        status: bytesSent >= file.size ? "complete" : "in-progress",
      });
    });
  }

  async function handleSendText(peer: PeerInfo, text: string) {
    const connection = getOrCreateConnection(peer.id);
    const offerSdp = await connection.createOffer();
    signalingRef.current?.send({ type: "signal", target: peer.id, data: { kind: "offer", sdp: offerSdp } });
    await connection.sendText(text);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_center,_#1e3a5f_0%,_#0f1d33_60%,_#080f1c_100%)] text-white flex items-center justify-center p-8">
      <div className="absolute top-4 right-4 flex items-center gap-3 text-xs text-slate-300">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={autoDownload}
            onChange={(event) => setAutoDownload(event.target.checked)}
          />
          Auto-download files
        </label>
        <button
          type="button"
          onClick={() => void requestNotificationPermission()}
          className="underline hover:text-white"
        >
          Enable notifications
        </button>
      </div>

      <PeerRadar
        myDeviceName={myDeviceName}
        peers={peers}
        transfers={transfers}
        onSendFile={handleSendFile}
        onSendText={handleSendText}
      />

      {receiveQueue[0] && <ReceiveDialog item={receiveQueue[0]} onDismiss={dequeueReceived} />}
    </div>
  );
}
```

Note: `handleSendFile` is referenced from the paste-listener `useEffect` before its declaration in source order — this is safe because `handleSendFile` is a `function` declaration (hoisted), not a `const` arrow function, and the effect only calls it at paste-event time (after the component has fully rendered), never during the synchronous render/setup phase.

- [ ] **Step 2: Run existing test suite to confirm nothing broke**

Run: `cd web && pnpm test`
Expected: PASS — all tests from Tasks 1, 2, 5 plus pre-existing store/signaling tests remain green.

- [ ] **Step 3: Run tsc to confirm no type errors**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add web/src/App.tsx
git -c user.name="iamkunal9" -c user.email="x-research@credshields.com" commit -m "Wire text messaging, receive dialog, notifications, and paste-to-send into App"
```

---

### Task 8: Manual verification (local two-tab)

**Files:** none (manual verification task, no code changes)

**Interfaces:**
- Consumes: worker (unchanged, already running via `wrangler dev` from prior work) and the fully wired web app (Tasks 1-7).

- [ ] **Step 1: Start both dev servers**

Run (background), from repo root:
```bash
cd worker && pnpm dev
```
and, from `web/`:
```bash
echo 'VITE_SIGNALING_URL=ws://127.0.0.1:8787/room' > .env.local
pnpm dev
```

- [ ] **Step 2: Verify right-click text send (desktop)**

Open two tabs at the Vite dev URL. In Tab A, right-click Tab B's peer circle. Expected: a text popover opens near the circle, pre-focused. Type a message and press Enter (or click Send).
Expected: Tab B's screen shows the `ReceiveDialog` with the sender's name and the text; if the text isn't a URL, it's already copied to Tab B's clipboard and shows "Copied to clipboard".

- [ ] **Step 3: Verify URL text rendering**

Repeat Step 2 sending `https://example.com`.
Expected: Tab B's dialog renders it as a clickable link, no "Copied to clipboard" message (URLs aren't auto-copied per the design).

- [ ] **Step 4: Verify file receive dialog (auto-download off)**

With the "Auto-download files" checkbox unchecked in Tab B, send a small file from Tab A (drop or click-to-browse on the peer circle, as before).
Expected: Tab B shows `ReceiveDialog` with filename, size, and (for an image) a thumbnail preview, plus a Download button that triggers the actual download when clicked.

- [ ] **Step 5: Verify auto-download bypass**

Check "Auto-download files" in Tab B, then send another file from Tab A.
Expected: Tab B downloads immediately with no dialog shown.

- [ ] **Step 6: Verify receive queue ordering**

With auto-download off in Tab B, send two texts back-to-back from Tab A.
Expected: Tab B shows the first message; after clicking Close, the second message appears.

- [ ] **Step 7: Verify paste-to-send (single peer only)**

With exactly two tabs open (one peer visible to each), copy an image (e.g. take a screenshot or copy an image from any app) and paste (Ctrl+V) into Tab A's page (not into any specific input — anywhere on the page).
Expected: the image is sent to Tab B automatically, appearing in Tab B's receive dialog (or auto-downloading, depending on Tab B's toggle).

- [ ] **Step 8: Verify notification button doesn't crash without a real permission grant**

Click "Enable notifications" in a tab. Expected: the browser's native permission prompt appears (or nothing happens if already decided) — no console errors.

- [ ] **Step 9: Stop background dev servers**

```bash
kill %1 %2 2>/dev/null || true
```

No commit for this task — it's a verification checkpoint. If any step fails, fix the relevant module from Tasks 1-7 before proceeding, then re-run from the failing step.

---

## Self-Review Notes

- **Spec coverage:** channel protocol extension (Task 1), receive queue + auto-download persistence (Task 2), text send popover with right-click/long-press (Tasks 3, 6), receive dialog with preview/URL-detection/copy (Task 4), notifications + sound (Task 5), paste-to-send single-peer constraint (Task 7), full wiring (Task 7), manual verification of every feature (Task 8) — all design sections covered.
- **Placeholder scan:** no TBD/TODO markers; every step has complete code or exact commands with expected output.
- **Type consistency:** `PeerConnection.sendText`/`onTextReceived` (Task 1) match their usage in `App.tsx`'s `handleSendText` and `connection.onTextReceived` assignment (Task 7); `ReceivedItem` shape (Task 2) matches `ReceiveDialog`'s prop usage (Task 4) and `App.tsx`'s `enqueueReceived` calls (Task 7); `PeerRadar`'s new `onSendText` prop (Task 6) matches `App.tsx`'s `handleSendText` signature passed into it (Task 7); `notifyReceived`/`playBlop`/`requestNotificationPermission` signatures (Task 5) match their call sites in `App.tsx` (Task 7).
