# @sandbox-sdk/vercel

Vercel Sandbox adapter for Sandbox SDK.

## Install

```bash
bun add @sandbox-sdk/core @sandbox-sdk/vercel
```

## Use

```ts
import { withSandbox } from "@sandbox-sdk/core";
import { vercel } from "@sandbox-sdk/vercel";

await withSandbox(
  { adapter: vercel({ runtime: "node24" }), cwd: "/vercel/sandbox" },
  async (sandbox) => sandbox.process.shell("node --version")
);
```

Pass `token`, `teamId`, and `projectId`, or use `VERCEL_OIDC_TOKEN`. Typed
native controls such as network policy, sessions, snapshots, and forks remain
available through `sandbox.raw`.

Read the [Vercel adapter documentation](https://sandbox-sdk.sh/adapters.md).

## License

MIT
