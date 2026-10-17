# Nearby

Peer-to-peer file sharing in the browser. Open the URL on devices on the same network, see them appear, drag a file (or send text) — transfer goes **device-to-device via WebRTC**. The Cloudflare Worker only relays signaling (SDP/ICE); it never sees file bytes.

## Try it

**Live demo:** [https://nearby.iamkunal9.in/](https://nearby.iamkunal9.in/)

Open that URL on two devices on the same Wi‑Fi / LAN — no install, no account. Self-hosting is optional if you want your own instance.

**Looking for a SnapDrop alternative?** → [nearby.iamkunal9.in/snapdrop-alternative](https://nearby.iamkunal9.in/snapdrop-alternative/) (comparison; Nearby is independent — not affiliated with SnapDrop or LimeWire).

## FAQ

### What is Nearby?

Nearby is a **peer-to-peer file sharing** web app. Devices on the same local network see each other automatically and send files or text **directly browser-to-browser** over WebRTC.

### Is Nearby a SnapDrop alternative?

**Yes, in the same category** — same habit (browser tabs on one Wi‑Fi, P2P send), different product. Nearby is MIT-licensed and self-hostable on Cloudflare. It is **not** SnapDrop and is **not** affiliated with LimeWire. Details: [SnapDrop alternative](https://nearby.iamkunal9.in/snapdrop-alternative/).

### Are files uploaded to a server?

**No.** File bytes never go through the server. A Cloudflare Worker only relays signaling (SDP/ICE) so peers can find each other and open a WebRTC connection.

### Do both devices need the same Wi‑Fi?

**Yes.** Discovery is same-network only (grouped by public IP, or IPv6 `/64`). There is no TURN relay for internet-wide transfers by design.

### Can I host my own instance?

**Yes.** Deploy the Worker + Pages app on your Cloudflare account — see [Deploy your own](#deploy-your-own-cloudflare) below. Source: [github.com/iamkunal9/nearby](https://github.com/iamkunal9/nearby).

## Stack

| Piece | Tech |
|---|---|
| Signaling | Cloudflare Worker + Durable Object (WebSocket hibernation) |
| Frontend | React 19 + Vite + TypeScript + Tailwind |
| Package manager | [Bun](https://bun.sh) workspaces |
| Discovery | Room keyed by public IP (`CF-Connecting-IP`; IPv6 uses `/64` prefix) |

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.2
- A [Cloudflare](https://dash.cloudflare.com) account (free tier is enough)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) comes via the `worker` / `web` packages — no global install required

## Quick start (local)

```bash
bun install

# Terminal 1 — signaling Worker (default http://localhost:8787)
bun run dev:worker

# Terminal 2 — frontend (Vite, usually http://localhost:5173)
bun run dev:web
```

Open the Vite URL in two browser windows (or a laptop + phone on the same LAN) and try a transfer. Local signaling defaults to `ws://localhost:8787/room`.

```bash
bun run test
```

## Deploy your own (Cloudflare)

You need two deployments: the **Worker** (signaling) and the **Pages** site (UI).

### 1. Log in to Cloudflare

```bash
bunx wrangler login
```

### 2. Deploy the signaling Worker

Optional: edit `worker/wrangler.toml` and change `name` if you want a different Worker name.

```bash
bun run deploy:worker
```

Wrangler prints a URL like:

```text
https://p2p-file-share-signaling.<your-subdomain>.workers.dev
```

### 3. Point the frontend at your Worker

```bash
cp web/.env.example web/.env.production
```

Set the production WebSocket URL (note the `/room` path and `wss://`):

```env
VITE_SIGNALING_URL=wss://p2p-file-share-signaling.<your-subdomain>.workers.dev/room
```

### 4. Deploy the frontend to Cloudflare Pages

Optional: change `--project-name` in `web/package.json` (`deploy` script) if you want a different Pages project name.

```bash
bun run deploy:web
```

Or both in one go (after `.env.production` is set):

```bash
bun run deploy
```

Open the Pages URL Wrangler prints (e.g. `https://p2p-file-share.pages.dev`) on two devices on the **same network**.

### Custom domain (optional)

In the Cloudflare dashboard, attach a custom domain to the Pages project and/or a custom route/domain to the Worker. If the Worker hostname changes, update `web/.env.production` and redeploy the web app.

## How it works

1. Browser loads the Pages app and opens a WebSocket to the Worker.
2. The Worker routes the socket to a Durable Object “room” for that network fingerprint.
3. Peers in the room see each other; WebRTC offers/answers/ICE candidates are relayed through the room.
4. File/text bytes move on a direct `RTCDataChannel` (STUN only — same-network by design; no TURN).

## Repo layout

```text
worker/   Cloudflare Worker + Room Durable Object
web/      React UI (Vite)
docs/     Design specs and implementation notes
```

`web/src/lib/protocol.ts` deliberately duplicates `worker/src/protocol.ts` — the packages deploy independently and do not import each other.

## Security / privacy notes

- No accounts, no server-side file storage.
- Signaling messages (peer names, SDP/ICE) pass through your Worker; file contents do not.
- Discovery is same-public-IP (or IPv6 `/64`) only. Do not add cross-network pairing or TURN without revisiting the design.

## License

MIT — see [LICENSE.md](./LICENSE.md).
