# P2P File Sharing App (SnapDrop-style) — Design

## Goal

A browser-based, peer-to-peer file sharing tool inspired by SnapDrop's ideology: open a URL, see devices on your local network automatically, drag a file onto one, it transfers directly device-to-device. No accounts, no file uploads to a server, no install.

## Scope

- **Platform**: Web-only (any modern browser, desktop + mobile).
- **Network model**: Same-network auto-discovery only (like original SnapDrop) — devices on the same local network see each other automatically via the signaling server grouping them into a "room" by network fingerprint.
- **Server role**: Signaling-only. The server introduces peers to each other (relays WebRTC handshake messages) and never sees file contents.
- **Deployment**: 100% Cloudflare, free tier — Cloudflare Pages (frontend) + Cloudflare Workers with a Durable Object (signaling).

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend framework | React 19 + Vite + TypeScript | Static build, deployed to Cloudflare Pages |
| Styling | Tailwind CSS | Drop-zone / device-radar UI |
| State | Zustand | Peer list, transfer progress, connection state |
| P2P transfer | WebRTC (`RTCPeerConnection` + `RTCDataChannel`) | Direct browser-to-browser, DTLS-encrypted by default |
| NAT traversal | Public STUN servers (Google/Cloudflare) | No TURN — same-network peers connect directly |
| Signaling server | Cloudflare Worker + Durable Object, TypeScript | Native `WebSocket` API + WebSocket Hibernation API (not Node's `ws` package — doesn't run in Workers runtime) |
| Room/peer grouping | Durable Object keyed by network fingerprint derived from client IP | Recreates SnapDrop's "devices on your network" auto-discovery |
| File chunking | Native `ArrayBuffer` slicing over DataChannel, streamed (not buffered whole in memory) | Handles large files without exhausting RAM |
| Tooling | pnpm, ESLint, Prettier, Wrangler CLI | `wrangler deploy` for both Pages and Worker |
| Source control | Git + GitHub (`iamkunal9` account), new repo | Commits with no author name attribution beyond the repo owner — no co-author lines |

## Architecture

```
┌─────────────┐   WebSocket (signaling only)   ┌───────────────────────┐
│  Browser A   │◄──────────────────────────────►│ Cloudflare Worker +   │
│ (React app)  │                                 │ Durable Object (room) │
└──────┬───────┘                                 └───────────┬───────────┘
       │                                                      │
       │                                                      ▼
       │                                            ┌─────────────┐
       │                                            │  Browser B   │
       │                                            │ (React app)  │
       │                                            └──────┬───────┘
       │                                                    │
       └──────────────── Direct WebRTC DataChannel ─────────┘
              (file bytes, P2P, DTLS-encrypted, chunked/streamed)
```

**Flow:**
1. Browser loads the React app from Cloudflare Pages, opens a WebSocket to the signaling Worker.
2. The Worker routes the connection to a Durable Object instance representing that network's "room" (fingerprint derived from client IP via Cloudflare's request headers).
3. The Durable Object tracks connected peers in that room and broadcasts the peer list to everyone in it (device radar UI).
4. User picks a peer → browser creates `RTCPeerConnection`, generates SDP offer, sends via the Durable Object to the target peer.
5. Target peer replies with SDP answer + both sides exchange ICE candidates, relayed via the Durable Object.
6. Once negotiated, a direct `RTCDataChannel` opens between the two browsers — the Durable Object is no longer involved for this pair.
7. Sender slices the file into chunks, streams them over the DataChannel respecting `bufferedAmount` backpressure; receiver reassembles chunks into a Blob and triggers a download, with a live progress bar driven by chunks-acked vs. total.
8. Signaling WebSocket stays alive via the Hibernation API so peers remain discoverable with no ongoing Cloudflare cost while idle.

## Error Handling

- **WebRTC connection failure** (no direct path found): show a clear "couldn't connect to this device" state; since this is same-network-only by design, this should be rare, but the UI won't hang indefinitely — a timeout surfaces the failure.
- **Signaling WebSocket drop**: auto-reconnect with backoff; peer list refreshes on reconnect.
- **Transfer interruption** (peer closes tab mid-transfer): DataChannel `close`/`error` events cancel the in-progress transfer and reset UI state cleanly, no partial-file corruption risk since the file is only written to disk once fully reassembled.
- **Backpressure**: sender pauses writing to the DataChannel when `bufferedAmount` exceeds a threshold, resumes on `bufferedamountlow`, preventing memory blowup on either side for large files.

## Testing / Verification Plan

- Manual verification is central here (this is a real-time, cross-browser networking feature — automated tests alone won't catch WebRTC quirks).
- Local dev: run Worker via `wrangler dev` + Vite dev server, open two browser tabs/windows (simulating two devices), verify discovery and transfer of a small file, a large file (multi-GB), and a rapid cancel mid-transfer.
- Deployed verification: after `wrangler deploy` (Pages + Worker), open the live Cloudflare URL on two real devices on the same network, repeat the above tests against the deployed environment — this is the final acceptance check before calling it done.

## Out of Scope (for this iteration)

- Cross-network transfers (different networks/rooms) — noted as a possible future extension, not built now.
- TURN relay fallback — not needed for same-network-only scope.
- Native/mobile app wrappers.
- Persistent history, accounts, or any server-side storage of files or metadata.

## Repo / Deployment Notes

- New GitHub repo created under `iamkunal9`, initialized via `git init` + `claude init` (CLAUDE.md project docs).
- Commits must not include any author attribution/co-author line beyond the repo owner.
- Cloudflare deployment uses the user's own Cloudflare account (Pages project + Worker/Durable Object), deployed via `wrangler deploy`, and the live deployment is the final test target.
