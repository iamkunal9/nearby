# SnapDrop-style Radar UI — Design

## Goal

Replace the current plain list/drop-zone UI with a SnapDrop-inspired radar layout: peers as colored circles arranged around a central pulsing drop target, on a dark gradient background, with click-or-drop-on-circle sending and an in-circle progress ring.

## Scope

Frontend only (`web/`) — no changes to signaling protocol, WebRTC transfer logic, or worker.

## Design

- **Background:** full-viewport dark radial gradient (navy/blue), replacing `bg-slate-900`.
- **Center drop target:** large pulsing circle, shows device's own name; idle animation via CSS.
- **Peer circles:** positioned in a ring around center at deterministic angle/radius derived from a hash of `peer.id` (stable across re-renders — no layout jitter). Each circle: color from a hash of `peer.id`, initial letter, name label below, gentle breathing animation.
- **Send interaction:** clicking a peer circle opens a per-peer hidden file input (browse); dragging a file onto a peer circle sends to that peer directly (dragover highlight state). No separate "select peer then drop zone" step — `DropZone.tsx` is removed.
- **Progress:** SVG ring around the peer circle sweeps 0→100% as `bytesTransferred/fileSize` updates; brief checkmark flash on completion, then returns to idle. Replaces the standalone `TransferProgress.tsx` bar list.
- **Removed files:** `web/src/components/DropZone.tsx`, `web/src/components/TransferProgress.tsx`.
- **New/changed files:** `web/src/components/DeviceList.tsx` becomes `web/src/components/PeerRadar.tsx` (radar layout + per-circle interaction + progress ring), `web/src/App.tsx` updated to drive per-peer send/receive instead of a single selected-peer + drop-zone flow, `web/src/index.css`/Tailwind config gets the gradient/animation utilities.

## Testing

Manual verification in two browser tabs (existing local dev setup): peer circles render at stable positions, click-to-send and drag-to-send both work, progress ring animates correctly for a real transfer, layout holds with 1 peer and with multiple peers.
