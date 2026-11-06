# @sandbox-sdk/cloudflare

Cloudflare 1.0 container adapter for Sandbox SDK.

## Install

```bash
bun add @sandbox-sdk/core @sandbox-sdk/cloudflare
```

## Use

```ts
import { DurableObject } from "cloudflare:workers";
import { cloudflare } from "@sandbox-sdk/cloudflare";
import { withSandbox } from "@sandbox-sdk/core";

type Env = Readonly<{ Sandbox: DurableObjectNamespace<Sandbox> }>;

export class Sandbox extends DurableObject<Env> {
  async run(): Promise<string> {
    const container = this.ctx.container;
    if (container === undefined)
      throw new Error("Configure the Sandbox container binding");
    return withSandbox(
      {
        adapter: cloudflare({
          container,
          id: this.ctx.id.toString(),
          startup: { entrypoint: ["sleep", "infinity"], enableInternet: false },
        }),
      },
      async (sandbox) => {
        await sandbox.files.write("message.txt", "hello cloudflare");
        return (await sandbox.process.exec("cat", ["message.txt"])).stdout;
      }
    );
  }
}

export default {
  async fetch(_request: Request, env: Env): Promise<Response> {
    return new Response(await env.Sandbox.getByName("example").run());
  },
} satisfies ExportedHandler<Env>;
```

Cloudflare 1.0 uses the native container from your own Durable Object. Pass `this.ctx.container` to `cloudflare()`. Configure a named `sandbox` image containing the matching `sandbox-shim`, or pass `image` explicitly. The adapter starts stopped containers and keeps native execution available through `sandbox.raw`.

The application owns authorization, request routing, concurrency, and Durable Object lifetime. Network access stays disabled unless `startup.enableInternet` is enabled. Native `exec()` does not inherit startup environment values, so the adapter merges configured values into each command. Finish processes and consume streams while their request context is alive.

Filesystem snapshots capture the root filesystem, excluding memory and mounted directories. Create with `snapshots.create(name?)`, restore in place with `snapshots.restore(id)`, or start a stopped container with `create({ snapshot: id })`. Container snapshots are a Cloudflare beta feature. Snapshot deletion is unsupported by the normalized container API.

Previews require an application-owned `preview` callback. Route requests to `container.getTcpPort(port).fetch()` in your Worker, and return its public URL from the callback. Put access headers in the callback's private `headers` field so `preview.request()` authenticates without serializing them. Old 0.x bindings, sessions, interpreter contexts, and automatic quick tunnels are not native 1.0 APIs.

`cloudflareBridge()` continues to target the official 0.12 HTTP bridge, deployed separately with `@cloudflare/sandbox@0.12.14` and its matching image. It supports files, bounded commands, sessions, and tunnels, but has no normalized background process handles or snapshots. Bridge paths stay below `/workspace`. Keep `SANDBOX_API_KEY` on the host and Worker, outside sandbox environment values.

## Image

```dockerfile
FROM node:24-trixie-slim
COPY --from=docker.io/cloudflare/sandbox:1.0.3 /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
WORKDIR /workspace
```

Configure `containers` with `class_name: "Sandbox"`, `scheduling_policy: "durable_object"`, and `images: { sandbox: { dockerfile: "./Dockerfile" } }`. Bind the class as a SQLite Durable Object and enable `nodejs_compat`.

## Migration

Replace `cloudflare({ binding: env.Sandbox })` with `cloudflare({ container: this.ctx.container })` inside your own Durable Object. The factory no longer imports the removed 0.x `Sandbox` class. Existing applications should follow the [Cloudflare migration guide](https://developers.cloudflare.com/sandbox/sdk/migrate/).

## Cleanup

`stop()` destroys the native container and its local state. Persist important files externally or save a snapshot first. `withSandbox()` attempts cleanup on success and failure.

Read the [Cloudflare adapter documentation](https://sandbox-sdk.sh/adapters.md).

## License

MIT
