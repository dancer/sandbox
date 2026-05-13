# Sandbox SDK

One TypeScript API for agent sandboxes. A small, typed runtime layer for files, commands, ports, capability-gated snapshots, and provider escape hatches.

https://sandbox-sdk.sh

## Install

```bash
bun add @sandbox-sdk/core @sandbox-sdk/local
```

## Quick Start

```ts
import { withSandbox } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";

await withSandbox(
  {
    adapter: local(),
    cwd: "/workspace",
  },
  async (sandbox) => {
    await sandbox.files.write("/workspace/main.ts", "console.log('hello')");

    const result = await sandbox.process.shell("bun /workspace/main.ts");

    console.log(result.stdout);
  }
);
```

Swap the adapter import to target a provider and keep the rest of your agent loop the same.

## What You Get

- One API across providers: create sandboxes, read and write files, run commands, expose ports, use snapshots where supported, and clean up
- Capability checks: branch on provider support instead of guessing what works
- Provider escape hatch: every adapter exposes its native client through `sandbox.raw`
- Safe cleanup: `withSandbox` stops sandboxes after success or failure
- Cancellation: pass `AbortSignal` and `timeout` to command calls
- Local snapshots: checkpoint and restore filesystem state in tests
- Local-first development: test agent loops without remote credentials
- TypeScript-first packages: each adapter ships as its own package so apps only install what they use

## Adapters

Current packages:

- `@sandbox-sdk/core`
- `@sandbox-sdk/local`
- `@sandbox-sdk/ai`
- `@sandbox-sdk/cloudflare`
- `@sandbox-sdk/daytona`
- `@sandbox-sdk/e2b`
- `@sandbox-sdk/vercel`

More providers will be added as adapters are written.

## AI Tools

`@sandbox-sdk/ai` wraps a configured sandbox as ready-made tools plus prompt context for agents that need to read files, write files, list directories, run commands, and open previews when ports are supported.

```ts
import { tools } from "@sandbox-sdk/ai";

const kit = tools(sandbox, {
  cwd: "/workspace",
  allow: ["read", "write", "list", "exec"],
});

kit.description;
kit.sandbox;
kit.sandbox.provider;
kit.sandbox.workingDirectory;
kit.sandbox.capabilities;
kit.tools;
```

The Cloudflare adapter is designed for Workers. Importing the package is safe in
Node-based tooling, but creating a Cloudflare sandbox loads
`@cloudflare/sandbox` inside the Worker path.

## Testing

```bash
bun run test
bun run test:live
```

The default test suite runs without provider credentials and covers core behavior, the local adapter, AI tool execution, and package exports. Live provider tests are skipped unless credentials are present.

- E2B: `E2B_API_KEY` or `E2B_ACCESS_TOKEN`
- Daytona: `DAYTONA_TARGET` plus either `DAYTONA_API_KEY`, or `DAYTONA_JWT_TOKEN` and `DAYTONA_ORGANIZATION_ID`
- Vercel: `VERCEL_OIDC_TOKEN`, or `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, and `VERCEL_PROJECT_ID`

## License

MIT
