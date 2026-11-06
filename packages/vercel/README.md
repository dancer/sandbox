# @sandbox-sdk/vercel

Vercel Sandbox adapter for Sandbox SDK.

The adapter uses Vercel's current universal image by default. Select `image` for
a Vercel Container Registry image, or set `runtime` explicitly for a legacy
Amazon Linux runtime. Images and runtimes are mutually exclusive. Snapshot
sources retain their own environment.

## Install

```bash
bun add @sandbox-sdk/core @sandbox-sdk/vercel
```

## Use

```ts
import { withSandbox } from "@sandbox-sdk/core";
import { vercel } from "@sandbox-sdk/vercel";

await withSandbox(
  {
    adapter: vercel({ image: "vercel/sandbox/universal", region: "iad1" }),
    cwd: "/vercel/sandbox",
  },
  async (sandbox) => sandbox.process.shell("node --version")
);
```

Pass `token`, `teamId`, and `projectId` for explicit authentication. When they
are absent, the adapter uses `VERCEL_OIDC_TOKEN`. Typed native controls such as
network policy, sessions, snapshots, and forks remain available through
`sandbox.raw`.

Read the [Vercel adapter documentation](https://sandbox-sdk.sh/adapters.md).

## Images, placement, and storage

Use `region` and `failoverRegions` for placement, and `networkId` for a Secure Compute network. Up to 15 unique ports can be declared or exposed dynamically. Sandbox tags retain the provider's five-key limit.

Import `VercelDrive` to create a native drive, then pass `mounts: { "/data": drive }` or a typed drive reference. Drives are provider-owned storage and remain available through native APIs. Forks can override their image and must explicitly declare drive mounts because Vercel does not inherit them.

## Cleanup

`stop()` stops the named sandbox. With Vercel's default persistent mode, it
snapshots the filesystem rather than deleting the named resource.

`withSandbox()` applies this cleanup even for an existing sandbox id. Consume
streams inside its callback. See the [lifecycle guide](https://sandbox-sdk.sh/lifecycle.md).

## License

MIT
