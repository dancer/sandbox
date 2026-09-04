# @sandbox-sdk/cloudflare

Cloudflare Sandbox adapter for Sandbox SDK.

## Install

```bash
bun add @sandbox-sdk/core @sandbox-sdk/cloudflare @cloudflare/sandbox
```

## Use

```ts
import type { Sandbox as CloudflareSandbox } from "@cloudflare/sandbox";
import { create } from "@sandbox-sdk/core";
import { cloudflare } from "@sandbox-sdk/cloudflare";

export { Sandbox } from "@cloudflare/sandbox";

type Env = Readonly<{
  Sandbox: DurableObjectNamespace<CloudflareSandbox>;
}>;

export default {
  async fetch(_request, env): Promise<Response> {
    const sandbox = await create({
      adapter: cloudflare({ binding: env.Sandbox }),
      cwd: "/workspace",
    });

    try {
      const result = await sandbox.process.shell("pwd");
      return Response.json({ stdout: result.stdout });
    } finally {
      await sandbox.stop();
    }
  },
} satisfies ExportedHandler<Env>;
```

Use `cloudflare()` inside a Worker with the Cloudflare Sandbox Durable Object
binding. Use `cloudflareBridge()` from Node or another non-Worker runtime with
an explicitly authenticated HTTPS bridge.

Read the [Cloudflare adapter documentation](https://sandbox-sdk.sh/adapters.md).

## Cleanup

`stop()` destroys the container and its local state, also when using the bridge.
Persist important data externally or configure backups before cleanup.

`withSandbox()` applies this cleanup even for an existing sandbox id. Consume
streams inside its callback. See the [lifecycle guide](https://sandbox-sdk.sh/lifecycle.md).

## License

MIT
