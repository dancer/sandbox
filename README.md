# Sandbox SDK

One TypeScript API for agent sandboxes. A small, honest runtime layer for files, commands, ports, snapshots, and provider escape hatches.

## Install

```bash
npm install @sandbox-sdk/core @sandbox-sdk/e2b
```

## Quick Start

```ts
import { create } from "@sandbox-sdk/core";
import { e2b } from "@sandbox-sdk/e2b";

const sandbox = await create({
  adapter: e2b({ token: process.env.E2B_API_KEY }),
});

await sandbox.files.write("main.ts", "console.log('hello')");
const result = await sandbox.process.exec("bun", ["main.ts"]);

await sandbox.stop();
```

Swap the adapter import (`@sandbox-sdk/vercel`, `@sandbox-sdk/cloudflare`, `@sandbox-sdk/daytona`, and more) and keep the rest of your agent loop the same.

## What You Get

- One API across providers: create sandboxes, read and write files, run commands, expose ports, create snapshots, and clean up
- Capability checks: branch on provider support instead of guessing what works
- Provider escape hatch: every adapter exposes its native client through `sandbox.raw`
- TypeScript-first packages: each adapter ships as its own package so apps only install what they use

## Adapters

The first adapter wave targets local development, E2B, Daytona, Vercel Sandbox, and Cloudflare Sandbox.

The broader roadmap includes Blaxel, Hopx, Modal, Runloop, CodeSandbox, Namespace, and self-hosted runtimes.

## AI Tools

`@sandbox-sdk/ai` wraps a configured sandbox as ready-made tools for agents that need to read files, write files, and run commands in an isolated runtime.

## License

MIT
