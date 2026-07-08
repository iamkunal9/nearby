# P2P File Sharing App (SnapDrop-style, Cloudflare-native) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based, peer-to-peer file sharing app (SnapDrop ideology) where devices on the same local network auto-discover each other and transfer files directly via WebRTC, with a Cloudflare Worker + Durable Object as a signaling-only relay, deployed entirely on Cloudflare's free tier.

**Architecture:** A React/Vite/TypeScript SPA (deployed to Cloudflare Pages) opens a WebSocket to a Cloudflare Worker, which routes it to a Durable Object keyed by the client's public IP (acting as the "same network" room). The Durable Object relays WebRTC signaling messages (SDP offer/answer, ICE candidates) between peers in the same room; once negotiated, file bytes flow directly between browsers over an `RTCDataChannel`, never touching Cloudflare.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind CSS, Zustand, WebRTC (`RTCPeerConnection`/`RTCDataChannel`), Cloudflare Workers + Durable Objects (Hibernatable WebSockets API), Wrangler CLI, pnpm workspaces, Vitest (`@cloudflare/vitest-pool-workers` for the worker, `vitest` + `@testing-library/react` for the frontend), GitHub (`gh` CLI, account `iamkunal9`).

## Global Constraints

- Same-network-only discovery (room = client's public IP fingerprint) — no cross-network pairing, no TURN relay.
- Server (Worker/Durable Object) must never receive file bytes — signaling messages only.
- All infra on Cloudflare free tier: Cloudflare Pages (frontend) + Workers/Durable Objects (signaling).
- File transfer must stream/chunk rather than buffer whole files in memory (supports large files).
- Git commits must NOT include any author/co-author attribution beyond the repo owner (`iamkunal9`) — no `Co-Authored-By` lines, no assistant name in commit messages.
- New GitHub repo created under the `iamkunal9` account via `gh` CLI (already authenticated).
- Final acceptance test is on the live Cloudflare deployment, tested from real browsers, not just local dev.

---

## File Structure

```
D:/share/
├── package.json                  # pnpm workspace root
├── pnpm-workspace.yaml
├── .gitignore
├── worker/
│   ├── package.json
│   ├── tsconfig.json
│   ├── wrangler.toml
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── index.ts              # Worker fetch handler — routes to Durable Object by IP
│   │   ├── room.ts               # Room Durable Object — peer registry + signaling relay
│   │   └── protocol.ts           # Shared message types (client<->server)
│   └── test/
│       └── index.test.ts
└── web/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── index.css
    │   ├── lib/
    │   │   ├── signaling.ts      # WebSocket client wrapper + reconnect
    │   │   ├── webrtc.ts         # Peer connection, chunked file transfer
    │   │   └── protocol.ts       # Mirrors worker/src/protocol.ts message types
    │   ├── store/
    │   │   └── useStore.ts       # Zustand store: peers, transfers, connection state
    │   └── components/
    │       ├── DeviceList.tsx
    │       ├── DropZone.tsx
    │       └── TransferProgress.tsx
    └── test/
        ├── webrtc.test.ts
        └── useStore.test.ts
```

---

### Task 1: Workspace scaffold + GitHub repo

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`

**Interfaces:**
- Produces: pnpm workspace containing `worker/` and `web/` packages (created in later tasks).

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "p2p-file-share",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "dev:worker": "pnpm --filter worker dev",
    "dev:web": "pnpm --filter web dev",
    "test": "pnpm --filter worker test && pnpm --filter web test"
  }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "worker"
  - "web"
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
dist/
.wrangler/
.dev.vars
*.log
.DS_Store
```

- [ ] **Step 4: Create the GitHub repo (public, empty, under iamkunal9)**

Run:
```bash
gh repo create iamkunal9/p2p-file-share --public --description "SnapDrop-style peer-to-peer file sharing, Cloudflare-native" --source=. --remote=origin
```
Expected: repo created and `origin` remote added, printed URL like `https://github.com/iamkunal9/p2p-file-share`.

- [ ] **Step 5: Initial commit**

```bash
git add package.json pnpm-workspace.yaml .gitignore docs/
git -c user.name="iamkunal9" -c user.email="x-research@credshields.com" commit -m "Scaffold pnpm workspace"
```

Note: every subsequent commit in this plan uses the same `-c user.name="iamkunal9" -c user.email="x-research@credshields.com"` pattern (or a pre-set local git config) and must never add a `Co-Authored-By` trailer.

- [ ] **Step 6: Push to GitHub**

```bash
git branch -M main
git push -u origin main
```
Expected: push succeeds, branch `main` tracks `origin/main`.

---

### Task 2: Worker package scaffold + shared protocol types

**Files:**
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/wrangler.toml`
- Create: `worker/src/protocol.ts`

**Interfaces:**
- Produces: `ClientMessage`, `ServerMessage` types used by `worker/src/room.ts` (Task 3) and mirrored in `web/src/lib/protocol.ts` (Task 6).

- [ ] **Step 1: Create worker/package.json**

```json
{
  "name": "worker",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.6.0",
    "@cloudflare/workers-types": "^4.20250101.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "wrangler": "^3.90.0"
  }
}
```

- [ ] **Step 2: Create worker/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create worker/wrangler.toml**

```toml
name = "p2p-file-share-signaling"
main = "src/index.ts"
compatibility_date = "2026-01-01"

[[durable_objects.bindings]]
name = "ROOM"
class_name = "Room"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["Room"]
```

- [ ] **Step 4: Create worker/src/protocol.ts**

```typescript
export interface PeerInfo {
  id: string;
  name: string;
}

export type ClientMessage =
  | { type: "signal"; target: string; data: SignalPayload };

export type ServerMessage =
  | { type: "peers"; peers: PeerInfo[] }
  | { type: "peer-joined"; peer: PeerInfo }
  | { type: "peer-left"; peerId: string }
  | { type: "signal"; from: string; data: SignalPayload };

export type SignalPayload =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice-candidate"; candidate: RTCIceCandidateInit };
```

- [ ] **Step 5: Install worker dependencies**

Run:
```bash
cd worker && pnpm install
```
Expected: `worker/node_modules` created, lockfile updated, no errors.

- [ ] **Step 6: Commit**

```bash
git add worker/package.json worker/tsconfig.json worker/wrangler.toml worker/src/protocol.ts pnpm-lock.yaml
git -c user.name="iamkunal9" -c user.email="x-research@credshields.com" commit -m "Scaffold worker package with shared protocol types"
```

---

### Task 3: Room Durable Object — peer registry + signaling relay

**Files:**
- Create: `worker/src/room.ts`
- Test: `worker/test/room.test.ts`

**Interfaces:**
- Consumes: `PeerInfo`, `ClientMessage`, `ServerMessage`, `SignalPayload` from `worker/src/protocol.ts` (Task 2).
- Produces: `Room` class (Durable Object) with `fetch(request: Request): Promise<Response>`, `webSocketMessage`, `webSocketClose`, `webSocketError` handlers — consumed by `worker/src/index.ts` (Task 4).

- [ ] **Step 1: Write the failing test for missing-peerId rejection**

```typescript
// worker/test/room.test.ts
import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";

describe("Room signaling", () => {
  it("rejects non-websocket requests with 426", async () => {
    const res = await SELF.fetch("https://example.com/room?peerId=abc&deviceName=Test");
    expect(res.status).toBe(426);
  });

  it("rejects websocket upgrade missing peerId", async () => {
    const res = await SELF.fetch("https://example.com/room", {
      headers: { Upgrade: "websocket" },
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd worker && pnpm test`
Expected: FAIL — `worker/src/index.ts` does not exist yet, or requests error out (no route defined). This is expected at this point since Task 4 creates `index.ts`; note this test file will be exercised for real once Task 4 is done. For now, confirm the test *runner* itself works by temporarily pointing it at `room.ts`'s exported `Room.prototype.fetch` directly:

```typescript
// worker/test/room.test.ts (temporary direct-unit variant, replaced in Task 4's step)
import { describe, it, expect } from "vitest";
import { Room } from "../src/room";

function makeRoom(): Room {
  const state = {
    acceptWebSocket: () => {},
    getWebSockets: () => [],
  } as unknown as DurableObjectState;
  return new Room(state, {} as Env);
}

describe("Room signaling", () => {
  it("rejects non-websocket requests with 426", async () => {
    const room = makeRoom();
    const res = await room.fetch(new Request("https://example.com/room?peerId=abc&deviceName=Test"));
    expect(res.status).toBe(426);
  });

  it("rejects websocket upgrade missing peerId", async () => {
    const room = makeRoom();
    const res = await room.fetch(
      new Request("https://example.com/room", { headers: { Upgrade: "websocket" } })
    );
    expect(res.status).toBe(400);
  });
});
```

Run: `cd worker && pnpm test`
Expected: FAIL with "Cannot find module '../src/room'".

- [ ] **Step 3: Implement worker/src/room.ts**

```typescript
import type { PeerInfo, ClientMessage, ServerMessage, SignalPayload } from "./protocol";

export interface Env {
  ROOM: DurableObjectNamespace;
}

interface Attachment {
  peerId: string;
  deviceName: string;
}

export class Room implements DurableObject {
  constructor(
    private state: DurableObjectState,
    private env: Env
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const url = new URL(request.url);
    const peerId = url.searchParams.get("peerId");
    const deviceName = url.searchParams.get("deviceName") ?? "Unknown device";
    if (!peerId) {
      return new Response("Missing peerId", { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server, [peerId]);
    server.serializeAttachment({ peerId, deviceName } satisfies Attachment);

    const existingPeers = this.listPeers().filter((p) => p.id !== peerId);
    this.send(server, { type: "peers", peers: existingPeers });
    this.broadcast({ type: "peer-joined", peer: { id: peerId, name: deviceName } }, peerId);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }
    if (parsed.type !== "signal") return;

    const targets = this.state.getWebSockets(parsed.target);
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (!attachment) return;

    const outgoing: ServerMessage = {
      type: "signal",
      from: attachment.peerId,
      data: parsed.data as SignalPayload,
    };
    for (const target of targets) {
      this.send(target, outgoing);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (!attachment) return;
    this.broadcast({ type: "peer-left", peerId: attachment.peerId }, attachment.peerId);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  private listPeers(): PeerInfo[] {
    return this.state.getWebSockets().map((ws) => {
      const attachment = ws.deserializeAttachment() as Attachment;
      return { id: attachment.peerId, name: attachment.deviceName };
    });
  }

  private broadcast(message: ServerMessage, excludePeerId: string): void {
    for (const ws of this.state.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as Attachment | null;
      if (attachment?.peerId === excludePeerId) continue;
      this.send(ws, message);
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    ws.send(JSON.stringify(message));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd worker && pnpm test`
Expected: PASS — both assertions green.

- [ ] **Step 5: Commit**

```bash
git add worker/src/room.ts worker/test/room.test.ts
git -c user.name="iamkunal9" -c user.email="x-research@credshields.com" commit -m "Add Room durable object with peer registry and signaling relay"
```

---

### Task 4: Worker entry point — route by IP fingerprint

**Files:**
- Create: `worker/src/index.ts`
- Modify: `worker/test/room.test.ts` (switch to full `SELF.fetch` integration style now that routing exists)
- Create: `worker/vitest.config.ts`

**Interfaces:**
- Consumes: `Room` class from `worker/src/room.ts` (Task 3).
- Produces: default-exported Worker `fetch` handler; `Env` interface with `ROOM: DurableObjectNamespace` — this is the deployed entry point referenced by `worker/wrangler.toml`'s `main`.

- [ ] **Step 1: Write worker/vitest.config.ts**

```typescript
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
      },
    },
  },
});
```

- [ ] **Step 2: Replace worker/test/room.test.ts with integration-style test**

```typescript
import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("Worker routing", () => {
  it("rejects non-websocket requests with 426", async () => {
    const res = await SELF.fetch("https://example.com/room?peerId=abc&deviceName=Test");
    expect(res.status).toBe(426);
  });

  it("rejects websocket upgrade missing peerId", async () => {
    const res = await SELF.fetch("https://example.com/room", {
      headers: { Upgrade: "websocket" },
    });
    expect(res.status).toBe(400);
  });

  it("accepts a valid websocket upgrade and returns 101", async () => {
    const res = await SELF.fetch("https://example.com/room?peerId=abc&deviceName=Test", {
      headers: { Upgrade: "websocket", "CF-Connecting-IP": "203.0.113.5" },
    });
    expect(res.status).toBe(101);
    expect(res.webSocket).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd worker && pnpm test`
Expected: FAIL — `worker/src/index.ts` not found (no `main` entry to route the request).

- [ ] **Step 4: Implement worker/src/index.ts**

```typescript
import { Room } from "./room";

export { Room };

export interface Env {
  ROOM: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/room") {
      return new Response("Not found", { status: 404 });
    }

    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const id = env.ROOM.idFromName(ip);
    const stub = env.ROOM.get(id);
    return stub.fetch(request);
  },
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd worker && pnpm test`
Expected: PASS — all three tests green.

- [ ] **Step 6: Commit**

```bash
git add worker/src/index.ts worker/vitest.config.ts worker/test/room.test.ts
git -c user.name="iamkunal9" -c user.email="x-research@credshields.com" commit -m "Route worker requests to Room durable object by client IP"
```

---

### Task 5: Web package scaffold (Vite + React + TS + Tailwind)

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/tailwind.config.js`
- Create: `web/postcss.config.js`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/index.css`

**Interfaces:**
- Produces: running Vite dev server rendering a placeholder `App` component — the mount point later tasks (DeviceList, DropZone, TransferProgress) attach to.

- [ ] **Step 1: Create web/package.json**

```json
{
  "name": "web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create web/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create web/vite.config.ts**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

- [ ] **Step 4: Create web/tailwind.config.js**

```javascript
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 5: Create web/postcss.config.js**

```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 6: Create web/index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>P2P File Share</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create web/src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: Create web/src/main.tsx**

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 9: Create web/src/App.tsx**

```typescript
export default function App() {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
      <h1 className="text-2xl font-semibold">P2P File Share</h1>
    </div>
  );
}
```

- [ ] **Step 10: Install web dependencies and verify dev server boots**

Run:
```bash
cd web && pnpm install && pnpm dev &
sleep 3
curl -sf http://localhost:5173 | grep -q "P2P File Share" && echo "DEV SERVER OK"
kill %1
```
Expected: prints `DEV SERVER OK`.

- [ ] **Step 11: Commit**

```bash
git add web/package.json web/tsconfig.json web/vite.config.ts web/tailwind.config.js web/postcss.config.js web/index.html web/src/main.tsx web/src/App.tsx web/src/index.css pnpm-lock.yaml
git -c user.name="iamkunal9" -c user.email="x-research@credshields.com" commit -m "Scaffold web package with Vite, React, and Tailwind"
```

---

### Task 6: Zustand store + shared protocol types (frontend)

**Files:**
- Create: `web/src/lib/protocol.ts`
- Create: `web/src/store/useStore.ts`
- Test: `web/test/useStore.test.ts`

**Interfaces:**
- Consumes: nothing (protocol.ts mirrors `worker/src/protocol.ts` types by hand — no cross-package import since worker and web are deployed independently).
- Produces: `useStore` Zustand hook with state `{ peers: PeerInfo[], transfers: Record<string, TransferState>, myPeerId: string, myDeviceName: string }` and actions `setPeers`, `addPeer`, `removePeer`, `upsertTransfer` — consumed by `web/src/lib/signaling.ts` (Task 7), `web/src/lib/webrtc.ts` (Task 8), and all components (Task 9).

- [ ] **Step 1: Create web/src/lib/protocol.ts**

```typescript
export interface PeerInfo {
  id: string;
  name: string;
}

export type ClientMessage = { type: "signal"; target: string; data: SignalPayload };

export type ServerMessage =
  | { type: "peers"; peers: PeerInfo[] }
  | { type: "peer-joined"; peer: PeerInfo }
  | { type: "peer-left"; peerId: string }
  | { type: "signal"; from: string; data: SignalPayload };

export type SignalPayload =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice-candidate"; candidate: RTCIceCandidateInit };
```

- [ ] **Step 2: Write the failing test for the store**

```typescript
// web/test/useStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "../src/store/useStore";

describe("useStore", () => {
  beforeEach(() => {
    useStore.setState({ peers: [], transfers: {} });
  });

  it("adds and removes peers", () => {
    useStore.getState().addPeer({ id: "a", name: "Phone" });
    expect(useStore.getState().peers).toEqual([{ id: "a", name: "Phone" }]);

    useStore.getState().removePeer("a");
    expect(useStore.getState().peers).toEqual([]);
  });

  it("upserts transfer progress", () => {
    useStore.getState().upsertTransfer({
      peerId: "a",
      fileName: "photo.png",
      fileSize: 1000,
      bytesTransferred: 0,
      direction: "send",
      status: "in-progress",
    });
    useStore.getState().upsertTransfer({
      peerId: "a",
      fileName: "photo.png",
      fileSize: 1000,
      bytesTransferred: 500,
      direction: "send",
      status: "in-progress",
    });
    expect(useStore.getState().transfers["a"].bytesTransferred).toBe(500);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && pnpm test`
Expected: FAIL — `../src/store/useStore` not found.

- [ ] **Step 4: Implement web/src/store/useStore.ts**

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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/protocol.ts web/src/store/useStore.ts web/test/useStore.test.ts
git -c user.name="iamkunal9" -c user.email="x-research@credshields.com" commit -m "Add zustand store and shared protocol types"
```

---

### Task 7: Signaling client (WebSocket wrapper + reconnect)

**Files:**
- Create: `web/src/lib/signaling.ts`
- Test: `web/test/signaling.test.ts`

**Interfaces:**
- Consumes: `ClientMessage`, `ServerMessage` from `web/src/lib/protocol.ts` (Task 6).
- Produces: `SignalingClient` class with `constructor(url: string, peerId: string, deviceName: string)`, methods `connect(): void`, `send(message: ClientMessage): void`, `close(): void`, and event hooks `onMessage: (msg: ServerMessage) => void`, `onOpen: () => void`, `onClose: () => void` — consumed by `web/src/App.tsx` (Task 9) and `web/src/lib/webrtc.ts` (Task 8).

- [ ] **Step 1: Write the failing test**

```typescript
// web/test/signaling.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignalingClient } from "../src/lib/signaling";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.onclose?.();
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  // @ts-expect-error test override
  globalThis.WebSocket = FakeWebSocket;
});

describe("SignalingClient", () => {
  it("connects and forwards parsed messages", () => {
    const client = new SignalingClient("wss://example.com/room", "peer-1", "Test Device");
    const received: unknown[] = [];
    client.onMessage = (msg) => received.push(msg);
    client.connect();

    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toBe("wss://example.com/room?peerId=peer-1&deviceName=Test%20Device");

    ws.onmessage?.({ data: JSON.stringify({ type: "peers", peers: [] }) });
    expect(received).toEqual([{ type: "peers", peers: [] }]);
  });

  it("serializes outgoing messages as JSON", () => {
    const client = new SignalingClient("wss://example.com/room", "peer-1", "Test Device");
    client.connect();
    client.send({ type: "signal", target: "peer-2", data: { kind: "offer", sdp: "abc" } });

    const ws = FakeWebSocket.instances[0];
    expect(ws.sent).toEqual([
      JSON.stringify({ type: "signal", target: "peer-2", data: { kind: "offer", sdp: "abc" } }),
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm test`
Expected: FAIL — `../src/lib/signaling` not found.

- [ ] **Step 3: Implement web/src/lib/signaling.ts**

```typescript
import type { ClientMessage, ServerMessage } from "./protocol";

export class SignalingClient {
  private ws: WebSocket | null = null;
  onMessage: (message: ServerMessage) => void = () => {};
  onOpen: () => void = () => {};
  onClose: () => void = () => {};

  constructor(
    private baseUrl: string,
    private peerId: string,
    private deviceName: string
  ) {}

  connect(): void {
    const url = `${this.baseUrl}?peerId=${encodeURIComponent(this.peerId)}&deviceName=${encodeURIComponent(this.deviceName)}`;
    const ws = new WebSocket(url);
    ws.onopen = () => this.onOpen();
    ws.onclose = () => this.onClose();
    ws.onmessage = (event: MessageEvent<string>) => {
      const parsed = JSON.parse(event.data) as ServerMessage;
      this.onMessage(parsed);
    };
    this.ws = ws;
  }

  send(message: ClientMessage): void {
    this.ws?.send(JSON.stringify(message));
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/signaling.ts web/test/signaling.test.ts
git -c user.name="iamkunal9" -c user.email="x-research@credshields.com" commit -m "Add signaling client with reconnectable websocket wrapper"
```

---

### Task 8: WebRTC transfer module (chunked send/receive with backpressure)

**Files:**
- Create: `web/src/lib/webrtc.ts`
- Test: `web/test/webrtc.test.ts`

**Interfaces:**
- Consumes: `SignalPayload` from `web/src/lib/protocol.ts` (Task 6); designed to be driven by `SignalingClient` events from `web/src/lib/signaling.ts` (Task 7).
- Produces: `PeerConnection` class with `constructor(onIceCandidate: (candidate: RTCIceCandidateInit) => void)`, `createOffer(): Promise<string>`, `acceptOffer(sdp: string): Promise<string>`, `acceptAnswer(sdp: string): Promise<void>`, `addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>`, `sendFile(file: File, onProgress: (bytesSent: number) => void): Promise<void>`, `onFileReceived: (file: Blob, name: string) => void`, `onProgress: (bytesReceived: number, totalBytes: number) => void` — consumed by `web/src/App.tsx` (Task 9). Chunk size constant `CHUNK_SIZE = 16384` and buffered-amount threshold `BUFFERED_AMOUNT_LOW_THRESHOLD = 1_048_576` are exported for reuse in tests and UI progress math.

- [ ] **Step 1: Write the failing test for chunk math (pure logic, no real RTCPeerConnection needed)**

```typescript
// web/test/webrtc.test.ts
import { describe, it, expect } from "vitest";
import { CHUNK_SIZE, chunkCount } from "../src/lib/webrtc";

describe("chunking math", () => {
  it("computes exact chunk count for evenly divisible sizes", () => {
    expect(chunkCount(CHUNK_SIZE * 4, CHUNK_SIZE)).toBe(4);
  });

  it("rounds up for remainders", () => {
    expect(chunkCount(CHUNK_SIZE * 4 + 10, CHUNK_SIZE)).toBe(5);
  });

  it("handles files smaller than one chunk", () => {
    expect(chunkCount(100, CHUNK_SIZE)).toBe(1);
  });

  it("handles zero-byte files as zero chunks", () => {
    expect(chunkCount(0, CHUNK_SIZE)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm test`
Expected: FAIL — `../src/lib/webrtc` not found.

- [ ] **Step 3: Implement web/src/lib/webrtc.ts**

```typescript
export const CHUNK_SIZE = 16384;
export const BUFFERED_AMOUNT_LOW_THRESHOLD = 1_048_576;

export function chunkCount(fileSize: number, chunkSize: number): number {
  if (fileSize === 0) return 0;
  return Math.ceil(fileSize / chunkSize);
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

interface FileHeader {
  type: "file-header";
  name: string;
  size: number;
}

export class PeerConnection {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private incomingChunks: ArrayBuffer[] = [];
  private incomingHeader: FileHeader | null = null;
  private incomingBytes = 0;

  onFileReceived: (file: Blob, name: string) => void = () => {};
  onProgress: (bytesReceived: number, totalBytes: number) => void = () => {};

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

  async sendFile(file: File, onProgress: (bytesSent: number) => void): Promise<void> {
    const channel = this.channel;
    if (!channel) throw new Error("Data channel not open");

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
  }

  private handleIncoming(data: string | ArrayBuffer): void {
    if (typeof data === "string") {
      const header = JSON.parse(data) as FileHeader;
      this.incomingHeader = header;
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && pnpm test`
Expected: PASS — all four chunk-math assertions green. (Full `RTCPeerConnection` negotiation is exercised manually in Task 10's two-tab browser test, since jsdom has no real WebRTC implementation.)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/webrtc.ts web/test/webrtc.test.ts
git -c user.name="iamkunal9" -c user.email="x-research@credshields.com" commit -m "Add chunked WebRTC file transfer module with backpressure"
```

---

### Task 9: UI components — DeviceList, DropZone, TransferProgress, App wiring

**Files:**
- Create: `web/src/components/DeviceList.tsx`
- Create: `web/src/components/DropZone.tsx`
- Create: `web/src/components/TransferProgress.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `useStore` (Task 6), `SignalingClient` (Task 7), `PeerConnection` (Task 8).
- Produces: fully wired `App` component — the deliverable tested manually in Task 10.

- [ ] **Step 1: Create web/src/components/DeviceList.tsx**

```typescript
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
```

- [ ] **Step 2: Create web/src/components/DropZone.tsx**

```typescript
import { useRef, useState, type DragEvent } from "react";

interface Props {
  disabled: boolean;
  onFileSelected: (file: File) => void;
}

export function DropZone({ disabled, onFileSelected }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFileSelected(file);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
        isDragging ? "border-sky-400 bg-slate-800" : "border-slate-600"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFileSelected(file);
        }}
      />
      <p>{disabled ? "Select a device first" : "Drop a file here, or click to choose one"}</p>
    </div>
  );
}
```

- [ ] **Step 3: Create web/src/components/TransferProgress.tsx**

```typescript
import type { TransferState } from "../store/useStore";

interface Props {
  transfer: TransferState;
}

export function TransferProgress({ transfer }: Props) {
  const percent = transfer.fileSize === 0 ? 0 : Math.round((transfer.bytesTransferred / transfer.fileSize) * 100);

  return (
    <div className="w-full">
      <div className="flex justify-between text-sm text-slate-300 mb-1">
        <span>
          {transfer.direction === "send" ? "Sending" : "Receiving"} {transfer.fileName}
        </span>
        <span>{percent}%</span>
      </div>
      <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full bg-sky-400" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite web/src/App.tsx to wire everything together**

```typescript
import { useEffect, useRef, useState } from "react";
import { useStore } from "./store/useStore";
import { SignalingClient } from "./lib/signaling";
import { PeerConnection } from "./lib/webrtc";
import { DeviceList } from "./components/DeviceList";
import { DropZone } from "./components/DropZone";
import { TransferProgress } from "./components/TransferProgress";
import type { PeerInfo } from "./lib/protocol";

const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL ?? "ws://localhost:8787/room";

export default function App() {
  const { myPeerId, myDeviceName, peers, transfers, setPeers, addPeer, removePeer, upsertTransfer } = useStore();
  const [selectedPeer, setSelectedPeer] = useState<PeerInfo | null>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const connectionsRef = useRef<Map<string, PeerConnection>>(new Map());

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
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
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

  async function handleFileSelected(file: File) {
    if (!selectedPeer) return;
    const connection = getOrCreateConnection(selectedPeer.id);
    const offerSdp = await connection.createOffer();
    signalingRef.current?.send({ type: "signal", target: selectedPeer.id, data: { kind: "offer", sdp: offerSdp } });

    await connection.sendFile(file, (bytesSent) => {
      upsertTransfer({
        peerId: selectedPeer.id,
        fileName: file.name,
        fileSize: file.size,
        bytesTransferred: bytesSent,
        direction: "send",
        status: bytesSent >= file.size ? "complete" : "in-progress",
      });
    });
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col gap-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold">P2P File Share</h1>
      <p className="text-slate-400 text-sm">You are: {myDeviceName}</p>

      <DeviceList peers={peers} onSelect={setSelectedPeer} />

      {selectedPeer && <p className="text-sky-400">Selected: {selectedPeer.name}</p>}

      <DropZone disabled={!selectedPeer} onFileSelected={handleFileSelected} />

      <div className="flex flex-col gap-3">
        {Object.values(transfers).map((transfer) => (
          <TransferProgress key={transfer.peerId} transfer={transfer} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run existing test suite to confirm nothing broke**

Run: `cd web && pnpm test`
Expected: PASS — store, signaling, and webrtc unit tests still green (no test targets `App.tsx` directly; it's covered by the manual browser test in Task 10).

- [ ] **Step 6: Commit**

```bash
git add web/src/components web/src/App.tsx
git -c user.name="iamkunal9" -c user.email="x-research@credshields.com" commit -m "Wire signaling and WebRTC transfer into the UI"
```

---

### Task 10: Local two-tab manual verification

**Files:** none (manual verification task, no code changes)

**Interfaces:**
- Consumes: worker (Tasks 2-4) via `wrangler dev`, web app (Tasks 5-9) via `vite dev`.

- [ ] **Step 1: Start the worker in dev mode**

Run (background):
```bash
cd worker && pnpm dev
```
Expected: log line showing the worker listening, typically `http://127.0.0.1:8787`.

- [ ] **Step 2: Start the web dev server, pointed at the local worker**

Run (background), from `web/`:
```bash
echo 'VITE_SIGNALING_URL=ws://127.0.0.1:8787/room' > .env.local
pnpm dev
```
Expected: Vite prints a local URL, typically `http://localhost:5173`.

- [ ] **Step 3: Open two browser tabs and verify discovery**

Open `http://localhost:5173` in two separate browser tabs (or two different browsers) on the same machine. Both are on `127.0.0.1`, so the worker's IP-based room grouping puts them in the same room.
Expected: within a couple seconds, each tab's device list shows the other tab's random device name.

- [ ] **Step 4: Verify a small file transfer**

In Tab A, click the device shown for Tab B, then drop a small file (e.g., a 100KB image) onto the drop zone.
Expected: Tab A shows a progress bar reaching 100% (status "Sending"); Tab B shows a progress bar reaching 100% (status "Receiving") and the browser triggers a file download matching the original file's name and content.

- [ ] **Step 5: Verify a large file transfer**

Repeat Step 4 with a file of at least 500MB (e.g., a video file).
Expected: transfer completes without the tab freezing or the browser tab crashing from memory pressure; downloaded file's size matches the original exactly (verify with `ls -la` on both the source and downloaded files).

- [ ] **Step 6: Verify mid-transfer cancellation is handled cleanly**

Start a large-file transfer, then close Tab B (the receiver) partway through.
Expected: Tab A does not hang indefinitely — the UI should not claim "complete" for a transfer that never finished (acceptable minimum bar: progress simply stops advancing; no crash, no incorrect "complete" status).

- [ ] **Step 7: Stop background dev servers**

Run:
```bash
kill %1 %2 2>/dev/null || true
```

No commit for this task — it's a verification checkpoint. If any step fails, fix the relevant module from Tasks 2-9 before proceeding, then re-run this task from Step 1.

---

### Task 11: Generate CLAUDE.md project documentation

**Files:**
- Create: `CLAUDE.md` (via the `init` skill, not hand-written)

**Interfaces:** none — documentation only.

- [ ] **Step 1: Invoke the init skill**

This step must be run by the coordinating session (not a subagent), since it invokes another Claude Code skill: run `/init` (or the `init` skill) from the repo root `D:/share` to generate `CLAUDE.md` describing the pnpm workspace, worker, and web packages.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git -c user.name="iamkunal9" -c user.email="x-research@credshields.com" commit -m "Add CLAUDE.md project documentation"
```

---

### Task 12: Cloudflare deployment (Worker + Pages)

**Files:**
- Modify: `web/src/App.tsx` (only the `SIGNALING_URL` env source, no logic change — production URL comes from a Pages env var set in Step 5)

**Interfaces:**
- Consumes: `worker/wrangler.toml` (Task 2), built `web/dist` output (Task 5's Vite config).

- [ ] **Step 1: Authenticate wrangler with the Cloudflare account**

Run:
```bash
cd worker && pnpm exec wrangler login
```
Expected: opens a browser window for OAuth login to Cloudflare; on success, prints "Successfully logged in." This step is interactive — the user must complete the browser login themselves if running non-interactively isn't possible.

- [ ] **Step 2: Deploy the Worker**

Run:
```bash
cd worker && pnpm exec wrangler deploy
```
Expected: output includes a deployed URL like `https://p2p-file-share-signaling.<account-subdomain>.workers.dev`. Record this URL — it's needed in Step 4.

- [ ] **Step 3: Build the web app for production**

Run:
```bash
cd web && pnpm build
```
Expected: `web/dist/` populated with static assets, build completes with no errors.

- [ ] **Step 4: Set the production signaling URL and rebuild**

Run, substituting the URL from Step 2 (using `wss://` instead of `https://`):
```bash
cd web && echo 'VITE_SIGNALING_URL=wss://p2p-file-share-signaling.<account-subdomain>.workers.dev/room' > .env.production
pnpm build
```
Expected: rebuild succeeds; `web/dist/assets/*.js` contains the production wss:// URL (spot check with `grep -r "workers.dev" dist/assets/*.js`).

- [ ] **Step 5: Create the Cloudflare Pages project and deploy**

Run:
```bash
cd web && pnpm exec wrangler pages deploy dist --project-name=p2p-file-share
```
Expected: prompts to create a new Pages project on first run (accept defaults), then prints a deployment URL like `https://p2p-file-share.pages.dev`.

- [ ] **Step 6: Commit the production env file reference (not the file itself — it's gitignored)**

`.env.production` and `.env.local` are already excluded via `.gitignore`'s absence of a `dist/`-only rule — confirm they're untracked:
```bash
git status --short
```
Expected: `.env.production` and `.env.local` do NOT appear in the output (Vite's `.env*.local` files should be gitignored). If they do appear, add `.env*.local` to `.gitignore`, then:
```bash
git add .gitignore
git -c user.name="iamkunal9" -c user.email="x-research@credshields.com" commit -m "Ignore local vite env files"
```

---

### Task 13: Live cross-device verification (final acceptance test)

**Files:** none (manual verification task)

**Interfaces:**
- Consumes: the deployed Pages URL and Worker URL from Task 12.

- [ ] **Step 1: Open the deployed app on two real devices on the same network**

Open the `https://p2p-file-share.pages.dev` URL (from Task 12, Step 5) on two different physical devices (e.g., a laptop and a phone) connected to the same Wi-Fi network.
Expected: each device's device list shows the other within a few seconds.

- [ ] **Step 2: Transfer a small file between the two devices**

Send a small file (e.g., a photo) from one device to the other.
Expected: transfer completes, receiving device downloads a file matching the original.

- [ ] **Step 3: Transfer a large file between the two devices**

Send a file of at least 500MB.
Expected: transfer completes without errors; verify file integrity by comparing file size (and optionally a checksum) between source and downloaded file.

- [ ] **Step 4: Verify two devices on different networks do NOT see each other**

With one device on Wi-Fi and another on a different network (e.g., mobile data with Wi-Fi off), open the app on both.
Expected: neither device appears in the other's device list — confirms the same-network-only room-by-IP design is working as intended, not accidentally leaking cross-network visibility.

No commit for this task. If any step fails, return to the relevant earlier task, fix, redeploy via Task 12, and re-run this verification.

---

## Self-Review Notes

- **Spec coverage:** web-only platform (Task 5-9), same-network auto-discovery via IP-keyed Durable Object rooms (Task 3-4), signaling-only server (Task 3's relay-only message handling), Cloudflare-native deployment (Task 12), large-file/streaming support (Task 8's chunking + Task 10/13's large-file verification), error handling for drops/backpressure (Task 8's `bufferedamountlow` handling, Task 10 Step 6), GitHub repo under `iamkunal9` (Task 1), no-attribution commits (Global Constraints + every commit step), CLAUDE.md (Task 11), live deployment as final test (Task 13) — all covered.
- **Placeholder scan:** no TBD/TODO markers; all steps include complete code or exact commands with expected output.
- **Type consistency:** `PeerInfo`, `SignalPayload`, `ClientMessage`, `ServerMessage` are defined identically in `worker/src/protocol.ts` (Task 2) and `web/src/lib/protocol.ts` (Task 6); `PeerConnection`'s method names (`createOffer`, `acceptOffer`, `acceptAnswer`, `addIceCandidate`, `sendFile`) defined in Task 8 match their usage in Task 9's `App.tsx` exactly; `TransferState` fields defined in Task 6 match usage in Task 9's `TransferProgress.tsx` and `App.tsx`.
