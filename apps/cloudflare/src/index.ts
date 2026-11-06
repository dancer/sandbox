import { DurableObject } from "cloudflare:workers";

import routes, { guard } from "./routes";
import type { Env } from "./shared";
import { json } from "./shared";

export class Native extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const { container } = this.ctx;
    if (container === undefined) {
      return json({ error: "missing_container", ok: false }, 500);
    }
    const url = new URL(request.url);
    const preview = /^\/preview\/[^/]+\/(\d+)(\/.*)?$/u.exec(url.pathname);
    if (preview !== null) {
      const target = Number(preview[1]);
      if (!Number.isInteger(target) || target < 1 || target > 65_535) {
        return json({ error: "invalid_port", ok: false }, 422);
      }
      url.protocol = "http:";
      url.pathname = preview[2] ?? "/";
      const headers = new Headers(request.headers);
      headers.delete("authorization");
      return await container
        .getTcpPort(target)
        .fetch(new Request(url.toString(), new Request(request, { headers })));
    }
    return routes.fetch(request, {
      container,
      id: this.ctx.id.toString(),
      url: url.origin,
      ...(this.env.SANDBOX_SDK_TOKEN === undefined
        ? {}
        : { SANDBOX_SDK_TOKEN: this.env.SANDBOX_SDK_TOKEN }),
      waitUntil: (promise) => this.ctx.waitUntil(promise),
    });
  }
}

export { Native as Sandbox };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const preview = /^\/preview\/([a-f0-9]{64})\/\d+(?:\/|$)/u.exec(
      url.pathname
    );
    if (preview !== null) {
      const token = env.SANDBOX_SDK_TOKEN?.trim();
      if (
        !token ||
        request.headers.get("authorization") !== `Bearer ${token}`
      ) {
        return json({ error: "unauthorized", ok: false }, 401);
      }
      return env.Sandbox.get(env.Sandbox.idFromString(preview[1] ?? "")).fetch(
        request
      );
    }
    const blocked = guard(request, env, url);
    if (blocked !== undefined) {
      return blocked;
    }
    let id = env.Sandbox.newUniqueId();
    if (url.pathname === "/sandbox-sdk/cleanup") {
      const input: unknown = await request
        .clone()
        .json()
        .catch(() => void 0);
      if (
        typeof input !== "object" ||
        input === null ||
        !("id" in input) ||
        typeof input.id !== "string" ||
        !/^[a-f0-9]{64}$/u.test(input.id)
      ) {
        return json({ error: "missing_id", ok: false }, 422);
      }
      id = env.Sandbox.idFromString(input.id);
    }
    return env.Sandbox.get(id).fetch(request);
  },
} satisfies ExportedHandler<Env>;
