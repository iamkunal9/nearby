# SnapDrop Feature Parity — Text Messaging, Receive Dialog, Notifications, Paste-to-Send — Design

## Goal

Bring the app closer to full SnapDrop feature parity: right-click/long-press to send text to a peer, a receive dialog with preview for incoming files/text, browser notifications + sound on receipt, and paste-to-send for clipboard images.

## Scope

Frontend only (`web/`). No signaling protocol changes — text messages travel over the existing `RTCDataChannel` alongside file chunks, distinguished by a new string-message discriminator. No worker/Durable Object changes.

## Design

### 1. Channel protocol extension (`web/src/lib/webrtc.ts`)

The `RTCDataChannel` already discriminates `typeof data === "string"` (control messages) from `ArrayBuffer` (binary file chunks). Add a second string-message shape:

```ts
type ChannelMessage =
  | { type: "file-header"; name: string; size: number }
  | { type: "text"; content: string };
```

`handleIncoming`'s existing `JSON.parse(data)` branch checks `.type` to route between starting a file receive vs. delivering a text message immediately (text has no chunked payload — it's a single send).

`PeerConnection` gains:
- `sendText(text: string): Promise<void>` — awaits `channelOpen` (same guard as `sendFile`), sends `{type:"text", content: text}`.
- `onTextReceived: (text: string) => void` callback, fired directly from `handleIncoming` when a `text` message arrives (no accumulation needed).

### 2. Store additions (`web/src/store/useStore.ts`)

- `receiveQueue: ReceivedItem[]` — ordered queue of incoming files/text awaiting the receive dialog. `ReceivedItem = { kind: "file"; blob: Blob; name: string; peerName: string } | { kind: "text"; content: string; peerName: string }`.
- `autoDownload: boolean` — persisted to `localStorage` (`p2p-auto-download`), read on store init.
- `notificationsEnabled: boolean` — reflects `Notification.permission === "granted"`, re-checked on demand (not persisted — it mirrors real browser state).
- Actions: `enqueueReceived(item)`, `dequeueReceived()`, `setAutoDownload(value)`.

### 3. Text send UI (`web/src/components/TextDialog.tsx`)

- New popover component, positioned near the peer circle that triggered it.
- Right-click (`onContextMenu`, `preventDefault`) on a peer circle opens it targeting that peer.
- Long-press (touch held ≥610ms with movement under a small threshold, matching SnapDrop's exact timing) does the same on touch devices.
- Contains a text input (auto-focused) + Send button; Escape or click-outside closes it.
- On send: calls `PeerConnection.sendText()` via the same connection-acquisition path `handleSendFile` uses (creates offer if no connection yet).

### 4. Receive dialog (`web/src/components/ReceiveDialog.tsx`)

- Renders the front of `receiveQueue` as a modal: sender name, and either:
  - **File:** filename, human-readable size, image thumbnail (`URL.createObjectURL`) if `blob.type` starts with `image/`, Download button (triggers the same anchor-click download already used).
  - **Text:** the text content; if it parses as a URL, rendered as a clickable link; otherwise a "Copy" button (and auto-copy on open, matching SnapDrop) with a toast confirmation.
- "Always auto-download files" checkbox writes to the store's `autoDownload` (persisted). When `autoDownload` is true, file receipts skip the dialog and download immediately instead of enqueueing — text still always shows the dialog (there's no non-interactive equivalent for text).
- Dismissing advances to the next queued item, or closes if empty.

### 5. Notifications + sound (`web/src/lib/notifications.ts`)

- `requestNotificationPermission(): Promise<void>` — wraps `Notification.requestPermission()`, called from a UI button (not on load, to avoid an unprompted browser permission dialog).
- `notifyReceived(title: string, body: string): void` — fires `new Notification(...)` only if permission is granted AND `document.hidden` is true (don't notify for a tab the user is already looking at).
- `playBlop(): void` — short two-tone beep via `AudioContext` + `OscillatorNode` (no binary asset needed), called alongside every receipt regardless of tab visibility (SnapDrop plays sound even when focused).

### 6. Paste-to-send (wired in `web/src/App.tsx`)

- Global `paste` event listener. If `event.clipboardData` contains an image item AND `peers.length === 1`, extract as a `File` and route through the same send path as a normal file drop. If `peers.length !== 1`, no-op (matches SnapDrop's real behavior, confirmed with the user — no toast needed for the zero/multi-peer case, keeps it simple).

### 7. `PeerRadar.tsx` changes

- Add `onContextMenu` and touch-hold handlers per peer circle, invoking a new `onOpenTextDialog(peer)` prop instead of building the dialog inline (keeps `PeerRadar` focused on layout/interaction, `TextDialog` owns its own UI).
- Track "last interacted peer" is NOT needed per the paste-to-send decision above (SnapDrop's exact single-peer-only behavior was chosen) — no extra state required here.

## Testing

Manual verification in two browser tabs (existing local dev workflow): right-click opens text dialog, sends and receives text with correct URL/plain-text handling, receive dialog shows for a file with correct preview/download, auto-download toggle skips the dialog, notification fires when tab is backgrounded (verify via `document.hidden` override or actually backgrounding the tab), paste-to-send works with exactly one peer and is a no-op otherwise.

## Out of Scope

- PWA install prompt (separate decision already declined earlier in this project).
- File queueing across *multiple simultaneous senders* beyond the receive-queue ordering already described — no reordering/priority logic needed.
- Persisting notification permission choice beyond what the browser itself remembers.
