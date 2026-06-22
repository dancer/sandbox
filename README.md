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
- Capability checks: branch on normalized support instead of guessing what works
- Provider escape hatch: every adapter exposes its native client through `sandbox.raw`
- Safe cleanup: `withSandbox` stops sandboxes after success or failure
- Cancellation: pass `AbortSignal` and `timeout` to command calls
- Local snapshots: checkpoint and restore filesystem state in tests
- Local-first development: test agent loops without remote credentials
- TypeScript-first packages: each adapter ships as its own package so apps only install what they use

## Foundation

`SandboxRuntime` is the low-level contract for vendor implementations.
It keeps file reads stream-first, supports direct bounded results and process
handles where each is truthful, and keeps provider power available through
`raw`. Higher-level helpers can still expose convenient methods like
`files.text()`, but the foundation stays flexible enough for large files,
long-running commands, and provider-specific behavior.
Adapter authors can use `fromSandboxRuntime()` to lift that contract
into the public `Sandbox` API.

For adapter authors, the best path is to implement the smallest truthful
low-level shape first:

- expose stream-first file reads through `SandboxRuntimeFiles.read()`
- expose direct `exec()` and `shell()` results when a provider only supports bounded commands
- expose process handles through `spawn()` and `spawnShell()` only when the provider can control their lifecycle
- expose `stdout` and `stderr` streams on process handles when the provider
  supports separate output streams
- advertise only capabilities that are actually implemented
- keep provider-specific methods and escape hatches on `raw`
- let `fromSandboxRuntime()` derive `files.text()`, `files.read()`,
  `process.exec()`, and `process.shell()` from stream-first spawn methods when
  direct results are unavailable

If a low-level process result already includes `stdout` or `stderr`, the core
helper preserves those fields. It only falls back to buffered process output
when the low-level result does not include captured output.

## Previews

`ports.expose()` returns a preview object with `url`, `port`, and `request()`.
`request()` and its header-based provider credentials stay out of serialized data.
Use `request()` when code needs to call a same-origin preview endpoint because
it retains provider-required access headers without exposing them in data:

```ts
const preview = await sandbox.ports.expose(3000);
const response = await preview.request("/health");

console.log(preview.url, response.status);
```

This makes restricted E2B and standard private Daytona previews work through
the same API. A signed Daytona preview remains useful when an external client
needs a self-contained URL. Treat any provider-issued signed or tokenized URL
as a credential and do not log or return it to an untrusted consumer. Daytona
standard preview tokens reset on sandbox restart, so call `ports.expose()` again
after restarting a sandbox. `request()` handles redirects manually by default
and rejects `redirect: "follow"`, so provider credentials cannot leave the
preview origin.

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
const checkpoint = await sandbox.snapshots.create();

const next = await create({
  adapter,
  snapshot: checkpoint.id,
});
```

The `snapshot` create option is supported by adapters that advertise
`snapshotSource`. Provider template ids still use `template`.

Snapshot names are supported only when the selected provider persists them.
Other adapters reject a name instead of silently discarding it.

## Adapters

Current packages:

- `@sandbox-sdk/core`
- `@sandbox-sdk/local`
- `@sandbox-sdk/ai`
- provider adapters are published as separate `@sandbox-sdk/*` packages

More providers will be added as adapters are written.

## Examples

See `examples/` for minimal local, provider, and AI tool starting points.

## Provider Power

The normalized `Sandbox` API should stay small and consistent. Provider-specific
features stay available through `sandbox.raw`, and every adapter exports a typed
raw alias so advanced usage keeps editor autocomplete and compile-time checks:

```ts
import type { Sandbox } from "@sandbox-sdk/core";
import type { VercelRaw } from "@sandbox-sdk/vercel";

async function tuneNetwork(sandbox: Sandbox<VercelRaw>) {
  await sandbox.raw.update({ networkPolicy: "deny-all" });
  await sandbox.raw.extendTimeout(300_000);
}
```

Use `supportsRaw(sandbox, "...")` and `raw` for features that do not have one
clean cross-provider meaning:
Cloudflare sessions, code contexts, quick tunnels, and configured backups,
and bucket mounts; Vercel network policy and timeout extension;
Vercel named sandbox list, get, getOrCreate, fork, dynamic updates, sessions,
interactive PTY connections, snapshot lists, snapshot trees, proxy helpers,
and native filesystem helpers;
E2B Git, MCP, PTY, create-time network settings, and mounted volumes; Daytona
SSH, PTY, LSP, create-time network settings, tier-gated network updates, and
resize; Modal create-time volumes, cloud bucket mounts, secrets, tags, connect
tokens, PTY, GPUs, and filesystem or directory snapshots; Blaxel create-time
volumes, drives, previews, sessions, system upgrades, and codegen; and
CodeSandbox VM lifecycle, preview tokens, sessions, interpreters, terminals,
and file watchers.

## AI Tools

`@sandbox-sdk/ai` wraps a configured sandbox as ready-made tools plus prompt context for agents that need to read files, write files, list directories, run commands, and open previews when ports are supported.

`tools()` omits requested model-facing operations that the selected adapter cannot
perform. The AI SDK session preserves its separate stdout and stderr process
contract, so `kit.sandbox.spawn()` rejects with a typed unsupported error when a
provider only exposes combined command output.

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

When trusted host code also needs lifecycle, ports, or provider-specific
controls, use `network()`. It is AI SDK session-compatible, while
`restricted()` returns a separate object without the host-owned backend:

```ts
import { network } from "@sandbox-sdk/ai";

const session = network(sandbox);
const preview = await session.backend.ports.expose(3000);
const agentSession = session.restricted();
```

With Vercel AI Gateway and AI SDK v6, use a `provider/model` string directly:

```ts
await generateText({
  model: "openai/gpt-5.4-nano",
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

For non-Worker apps, use the official Cloudflare Sandbox bridge instead:

```ts
import { create } from "@sandbox-sdk/core";
import { cloudflareBridge } from "@sandbox-sdk/cloudflare";

const sandbox = await create({
  adapter: cloudflareBridge({
    token: process.env.SANDBOX_API_KEY,
    url: process.env.SANDBOX_API_URL,
  }),
});
```

The bridge adapter supports normalized files, command execution, and HTTPS port
exposure over HTTP. `ports.expose()` creates a zero-config ephemeral quick
tunnel by default. Set the adapter `tunnel` option to request a stable named
tunnel when the bridge Worker has the required Cloudflare account and zone
credentials. Bridge lifecycle, sessions, persist, hydrate, bucket mounts,
warm-pool controls, health, OpenAPI schema access, raw tunnel controls, and PTY
connection descriptors are available through `sandbox.raw`. Normalized
snapshots and terminal I/O stay unsupported because the bridge does not expose
the same snapshot or WebSocket ownership contract as the Worker binding adapter.
`SANDBOX_API_KEY` authenticates the bridge and is rejected from sandbox
environment configuration so the control-plane credential is not forwarded into
the remote sandbox.

## Cloudflare Validation

`apps/cloudflare` is a deployable Worker fixture for the Cloudflare live test.
It exports the Sandbox Durable Object class, binds it in `wrangler.jsonc`, and
validates file operations, command execution, shell execution, background
process spawning, and reachable quick tunnels through the shared adapter.

`@sandbox-sdk/cloudflare` enforces Cloudflare's RPC transport so stream writes,
stream reads, sessions, and tunnels work without app-specific transport
configuration. `ports.expose()` returns a zero-config HTTPS quick tunnel by
default. Set the adapter `tunnel` option to request a stable named tunnel when
the Worker has the upstream Cloudflare account and zone credentials configured.
Quick tunnels are public and ephemeral, so do not treat the generated URL as
authentication. Add authentication inside the exposed service when its content
is sensitive. Ports must be in 1024-65535, excluding reserved port 3000.

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

The default test suite never loads `.env.local`, even when it exists. It covers
core behavior, the local adapter, AI tool execution, package exports, config
tests, and sanitized replay fixtures. Replay fixtures lock down the normalized
SDK contract without hitting providers.

Live provider scripts load `.env.local` explicitly and skip unless credentials
are present. `bun run verify:env` prints provider readiness without printing
secret values. The live scripts are the source of truth for real provider
behavior and may create billable sandboxes. Use the provider-specific live
commands while adding credentials so one failing provider does not block the
rest of the validation pass.

The CodeSandbox live verifier runs with Node because the upstream
`@codesandbox/sdk` websocket session works there. Bun still runs the
CodeSandbox config and replay tests.

- Blaxel: `BL_WORKSPACE` with `BL_API_KEY` or `BL_CLIENT_CREDENTIALS`, or Blaxel CLI config; set `BL_REGION` when you need a specific region
- Cloudflare: deploy `apps/cloudflare` and set `CLOUDFLARE_SANDBOX_WORKER_URL` and `CLOUDFLARE_SANDBOX_TOKEN`
- CodeSandbox: `CSB_API_KEY`
- Daytona: `DAYTONA_API_KEY`
- E2B: `E2B_API_KEY` or `E2B_ACCESS_TOKEN`
- Modal: `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`, or Modal CLI config
- Vercel: `VERCEL_OIDC_TOKEN`, or `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, and `VERCEL_PROJECT_ID`

## License

MIT
