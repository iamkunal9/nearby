import { Room } from "./room";

export { Room };

export interface Env {
  ROOM: DurableObjectNamespace;
}

function expandIPv6(ip: string): string[] {
  if (!ip.includes("::")) return ip.split(":");
  const [head, tail] = ip.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;
  return [...headParts, ...Array(missing).fill("0"), ...tailParts];
}

// IPv4 NAT means every device on a LAN shares one public IP, so the raw
// address is a valid room key. IPv6 gives each device on the same LAN its
// own address, so devices only share a network if they share their /64
// prefix (the first 4 hextets) - use that as the room key instead.
export function roomKeyForIp(ip: string): string {
  if (!ip.includes(":")) return ip;
  return expandIPv6(ip).slice(0, 4).join(":");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/room") {
      return new Response("Not found", { status: 404 });
    }

    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const id = env.ROOM.idFromName(roomKeyForIp(ip));
    const stub = env.ROOM.get(id);
    return stub.fetch(request);
  },
};
