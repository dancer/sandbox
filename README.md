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

- One API across providers: create sandboxes, stream, read, and write files, run commands, expose ports, use snapshots where supported, and clean up
- Capability checks: branch on provider support instead of guessing what works
- Provider escape hatch: every adapter exposes its native client through `sandbox.raw`
- Safe cleanup: `withSandbox` stops sandboxes after success or failure
- Cancellation: pass `AbortSignal` and `timeout` to command calls
- Local snapshots: checkpoint and restore filesystem state in tests
- Local-first development: test agent loops without remote credentials
- TypeScript-first packages: each adapter ships as its own package so apps only install what they use

## Foundation

`SimpleInsecureSandbox` is the low-level contract for vendor implementations.
It keeps file reads stream-first, process execution handle-based, and provider
power available through `raw`. Higher-level helpers can still expose convenient
methods like `files.text()`, but the foundation stays flexible enough for large
files, long-running commands, and provider-specific behavior.
Adapter authors can use `fromSimpleInsecureSandbox()` to lift that contract
into the public `Sandbox` API.

For adapter authors, the best path is to implement the smallest truthful
low-level shape first:

- expose stream-first file reads through `SimpleInsecureFiles.read()`
- expose process handles through `spawn()` and `spawnShell()`
- advertise only capabilities that are actually implemented
- keep provider-specific methods and escape hatches on `raw`
- let `fromSimpleInsecureSandbox()` derive `files.text()`, `files.read()`,
  `process.exec()`, and `process.shell()` for the public API

If a low-level process result already includes `stdout` or `stderr`, the core
helper preserves those fields. It only falls back to buffered process output
when the low-level result does not include captured output.

## Snapshots

Snapshot support is capability-gated because providers expose different
lifecycle shapes.
Some providers pause or stop a sandbox while creating a snapshot, so snapshot
creation should be treated as a lifecycle operation rather than a transparent
file copy.

Use `sandbox.snapshots.create()` when `supports(sandbox, "snapshotCreate")` is
true. Use `sandbox.snapshots.restore(id)` only when
`supports(sandbox, "snapshotRestore")` is true; restore means in-place restore
of the current sandbox.

To create a fresh sandbox from a snapshot, pass the snapshot id to `create()`:

```ts
const checkpoint = await sandbox.snapshots.create("ready");

const next = await create({
  adapter,
  snapshot: checkpoint.id,
});
```

The `snapshot` create option is supported by adapters that advertise
`snapshotSource`. Provider template ids still use `template`.

## Adapters

Current packages:

- `@sandbox-sdk/core`
- `@sandbox-sdk/local`
- `@sandbox-sdk/ai`
- provider adapters are published as separate `@sandbox-sdk/*` packages

More providers will be added as adapters are written.

## Examples

See `examples/` for minimal local, provider, and AI tool starting points.

## AI Tools

`@sandbox-sdk/ai` wraps a configured sandbox as ready-made tools plus prompt context for agents that need to read files, write files, list directories, run commands, and open previews when ports are supported.

```ts
import { aisdk, tools } from "@sandbox-sdk/ai";

const kit = tools(sandbox, {
  cwd: "/workspace",
  allow: ["read", "write", "list", "exec"],
});
const ai = aisdk(kit);

kit.description;
kit.sandbox;
kit.sandbox.provider;
kit.sandbox.workingDirectory;
kit.sandbox.capabilities;
kit.tools;
ai.tools;
```

Vercel AI SDK v6 and v7 can use the returned tools and prompt context directly:

```ts
await generateText({
  model,
  ...ai,
  prompt: "run the tests",
});
```

OpenAI Agents SDK can use the dedicated subpath. It imports the real
`@openai/agents` `tool()` helper and keeps side-effect tools approval-gated by
default:

```ts
import { Agent, run } from "@openai/agents";
import { openai } from "@sandbox-sdk/ai/openai";

const agentKit = openai(kit, { requireApproval: false });
const agent = new Agent({
  name: "sandbox agent",
  instructions: agentKit.instructions,
  tools: Object.values(agentKit.tools),
});

await run(agent, "run the tests");
```

Claude Agent SDK can use the Claude subpath. It wraps the sandbox tools in an
in-process MCP server and returns the fields needed by `query()`:

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { claude } from "@sandbox-sdk/ai/claude";

const agentKit = claude(kit, { requireApproval: false });

for await (const message of query({
  prompt: "run the tests",
  options: {
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: agentKit.instructions,
    },
    mcpServers: agentKit.mcpServers,
    allowedTools: agentKit.allowedTools,
    canUseTool: agentKit.canUseTool,
    tools: [],
  },
})) {
  console.log(message);
}
```

`@sandbox-sdk/ai` does not depend on `ai`. OpenAI and Claude support live behind
optional subpaths so apps only install the agent framework they use.

The Cloudflare adapter is designed for Workers. Importing the package is safe in
Node-based tooling, but creating a Cloudflare sandbox loads
`@cloudflare/sandbox` inside the Worker path.

## Cloudflare Validation

`apps/cloudflare` is a deployable Worker fixture for the Cloudflare live test.
It exports the Sandbox Durable Object class, binds it in `wrangler.jsonc`, and
validates file operations, command execution, shell execution, and background
process spawning through the shared adapter.

Cloudflare's native stream write path currently requires the provider SDK's RPC
transport. `@sandbox-sdk/cloudflare` normalizes non-string writes through base64
content so `files.write()` works on the default transport without app-specific
Cloudflare transport knowledge.

Cloudflare port previews need custom-domain wildcard routing in production.
Deploying to `.workers.dev` is enough for the live validation endpoint, but not
for production `ports.expose()` preview URLs.
Preview ports must follow Cloudflare's provider rules: integers from 1 to
65535, excluding system ports below 1024 and reserved port 3000.
Set `CLOUDFLARE_SANDBOX_PREVIEW_HOST` to run the optional Cloudflare port
verification test against a custom preview host.
Use the zone apex as the preview host when possible so generated preview
subdomains are covered by the normal wildcard certificate. Subdomain preview
hosts need matching wildcard TLS coverage.

## API Reference

The generated API reference lives in [`docs/api.md`](docs/api.md). It is built
from package declaration output so exported types, functions, and JSDoc stay in
sync with the published packages.

```bash
bun run docs:api
```

## Testing

```bash
bun run verify:env
bun run test
bun run verify:providers
bun run verify:e2b
```

The default test suite runs without provider credentials and covers core
behavior, the local adapter, AI tool execution, package exports, config tests,
and sanitized replay fixtures. Replay fixtures lock down the normalized SDK
contract without hitting providers.

Live provider scripts load `.env.local` automatically and skip unless
credentials are present. `bun run verify:env` prints provider readiness without
printing secret values. The live scripts are the source of truth for real
provider behavior and may create billable sandboxes. Use the provider-specific
live commands while adding credentials so one failing provider does not block
the rest of the validation pass.

The CodeSandbox live verifier runs with Node because the upstream
`@codesandbox/sdk` websocket session works there. Bun still runs the
CodeSandbox config and replay tests.

- Blaxel: `BL_WORKSPACE` with `BL_API_KEY` or `BL_CLIENT_CREDENTIALS`, or Blaxel CLI config; set `BL_REGION` when you need a specific region
- Cloudflare: deploy `apps/cloudflare` and set `CLOUDFLARE_SANDBOX_WORKER_URL` and `CLOUDFLARE_SANDBOX_TOKEN`; set `CLOUDFLARE_SANDBOX_PREVIEW_HOST` to verify `ports.expose()`
- CodeSandbox: `CSB_API_KEY`
- Daytona: `DAYTONA_API_KEY`; set `DAYTONA_TARGET` when you need a specific region
- E2B: `E2B_API_KEY` or `E2B_ACCESS_TOKEN`
- Modal: `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`, or Modal CLI config
- Vercel: `VERCEL_OIDC_TOKEN`, or `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, and `VERCEL_PROJECT_ID`

## License

MIT
