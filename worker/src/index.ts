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
