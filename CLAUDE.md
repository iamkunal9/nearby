# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

SnapDrop-style peer-to-peer file sharing web app, Cloudflare-native. Devices on the same local network (grouped by public IP) auto-discover each other and transfer files directly browser-to-browser via WebRTC. The server only relays signaling (SDP/ICE) messages — it never sees file bytes. Design spec: `docs/superpowers/specs/2026-07-09-p2p-file-share-design.md`. Implementation plan: `docs/superpowers/plans/2026-07-09-p2p-file-share.md`.

## Structure

Bun workspace with two independent packages — they do not import from each other and are deployed separately:

- `worker/` — Cloudflare Worker + Durable Object signaling server (TypeScript). `worker/src/index.ts` routes requests to the `Room` Durable Object (`worker/src/room.ts`) keyed by `CF-Connecting-IP`. Message types are defined in `worker/src/protocol.ts`.
- `web/` — React 19 + Vite + TypeScript + Tailwind frontend. `web/src/lib/protocol.ts` hand-duplicates the worker's message types (deliberate — no cross-package import since they deploy independently). Core logic lives in `web/src/lib/signaling.ts` (WebSocket client) and `web/src/lib/webrtc.ts` (chunked WebRTC file transfer with backpressure). State is in `web/src/store/useStore.ts` (Zustand).

## Commands

Run from the repo root unless noted:

- `bun run dev:worker` — signaling server locally (`wrangler dev`, `worker/`)
- `bun run dev:web` — frontend locally (`vite`, `web/`)
- `bun run test` — both packages' Vitest suites (`bun test` alone is Bun's built-in runner — avoid it here)
- `bun run deploy:worker` / `bun run deploy:web` — deploy to Cloudflare
- Per-package: `cd worker && bun run test` / `cd web && bun run test`

## Testing gotcha (Windows)

`worker/vitest.config.ts` uses `miniflare: { unsafeEphemeralDurableObjects: true }` instead of on-disk SQLite-backed Durable Object storage. This works around a Windows-specific bug in `@cloudflare/vitest-pool-workers` (SQLite file teardown fails with `EBUSY`, or open fails with `SQLITE_CANTOPEN`) — persistent DO storage tests may need to run on Linux/macOS/CI instead of locally on Windows.

## Conventions

- Git commits: author only as the repo owner — no `Co-Authored-By` trailers or other attribution.
- Same-network-only discovery by design — do not add cross-network pairing or TURN relay without updating the design spec first.
- Never commit `web/.env.production` or real Worker URLs/tokens; use `web/.env.example` as the template.
