export const site = {
  baseUrl: "https://sandbox-sdk.sh",
  github: "https://github.com/dancer/sandbox",
  name: "Sandbox SDK",
  summary:
    "One TypeScript API for agent sandboxes. Files, commands, ports, snapshots, and a typed escape hatch, across every major provider.",
} as const;

export type Doc = Readonly<{
  body: string;
  slug: string;
  summary: string;
  title: string;
}>;

const why = `# Why a contract

Every sandbox provider exposes a slightly different API for the same handful of primitives. \`@sandbox-sdk/core\` exposes the slice that is the same everywhere, files, processes, ports, snapshots, behind one small contract, and gets out of the way for anything provider-specific.

- One small API across providers. Swap E2B for Daytona without rewriting your agent loop.
- Web-standards I/O. Accepts \`string\`, \`Uint8Array\`, \`Blob\`, \`ArrayBuffer\`, or a \`ReadableStream\`. Runs on Node, Bun, and Workers, anywhere the fetch primitives run.
- Capabilities, not surprises. Each adapter declares what it supports. Branch on \`supports(sandbox, "snapshotCreate")\` and \`supports(sandbox, "snapshotRestore")\` instead of discovering it the hard way in production.
- Escape hatch via \`sandbox.raw\`. The native client is always one property away, typed per adapter, for anything outside the unified surface.
- Predictable errors. A single \`SandboxError\` with a normalized \`code\` across providers, and the original error attached as \`cause\`.`;

const installation = `# Installation

Install \`@sandbox-sdk/core\` together with the adapter you want to run against. Each provider ships as its own package, so apps only install what they use.

\`\`\`bash
bun add @sandbox-sdk/core @sandbox-sdk/local
\`\`\`

\`\`\`bash
pnpm add @sandbox-sdk/core @sandbox-sdk/local
\`\`\`

\`\`\`bash
npm install @sandbox-sdk/core @sandbox-sdk/local
\`\`\`

\`\`\`bash
yarn add @sandbox-sdk/core @sandbox-sdk/local
\`\`\`

Swap the adapter package to target a provider, for example \`@sandbox-sdk/vercel\`, and keep the rest of your agent loop the same.`;

const quickStart = `# Quick start

Call \`withSandbox\` with an adapter to get a typed \`Sandbox\` that is stopped automatically after success or failure. The adapter is fixed at construction; there is no runtime \`{ provider, ... }\` form, which keeps call sites flat and lets the \`raw\` property stay narrowly typed.

\`\`\`ts
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
\`\`\`

Use \`create()\` instead of \`withSandbox\` when you want to manage the lifecycle yourself; call \`sandbox.stop()\` when done.`;

const adapters = `# Adapters

Every adapter implements the same \`Sandbox\` contract. Provider-specific power stays on \`sandbox.raw\`. Config values always take precedence over environment variables.

## Local (@sandbox-sdk/local)

Local filesystem and child process. The dev and test adapter: point it at a directory and it implements the same \`Sandbox\` contract as the cloud adapters using \`node:fs/promises\` and \`node:child_process\`. It is not an isolation boundary for untrusted code. Every path is resolved against the sandbox root and rejected if it escapes. Ports return derived localhost HTTP URLs, and filesystem snapshots support create and restore in the same process.

- \`root\`: directory the adapter manages. When omitted, a fresh \`mkdtemp\` directory is created and \`stop()\` deletes it. Paths that resolve outside it throw \`SandboxError\` with \`code: "path_escape"\`.
- \`keep\`: when \`true\`, \`stop()\` leaves an auto-created root in place for inspection.
- Credentials: none.

## Blaxel (@sandbox-sdk/blaxel)

Blaxel perpetual sandboxes via \`@blaxel/core\`. Maps Blaxel files, process execution, background processes, and public HTTPS preview URLs onto the shared surface. Use \`sandbox.raw.previews\` for private previews, preview tokens, URL prefixes, and verified custom domains. Pass \`apiKey\` and \`workspace\` explicitly, or let the Blaxel SDK use its environment defaults.

- \`image\`, \`workspace\`, \`ports\`.
- Credentials: \`BL_WORKSPACE\` with \`BL_API_KEY\` or \`BL_CLIENT_CREDENTIALS\`.

## Cloudflare (@sandbox-sdk/cloudflare)

Cloudflare via \`@cloudflare/sandbox\`. Backed by a Durable Object running a Linux container, so the adapter takes a binding from \`env\` rather than an API key. The Worker must export \`Sandbox\` from \`@cloudflare/sandbox\` and bind that Durable Object in \`wrangler.jsonc\`. The adapter enforces RPC transport and \`ports.expose()\` returns a zero-config HTTPS quick tunnel by default. For non-Worker runtimes, deploy Cloudflare's HTTP bridge and use \`cloudflareBridge()\`; its \`ports.expose()\` also creates quick HTTPS tunnels, while \`tunnel\` opts into a named tunnel when the bridge Worker is configured for one. \`SANDBOX_API_KEY\` authenticates the bridge and is rejected from sandbox environment configuration.

- \`binding\` (required), \`id\`, \`tunnel\`.
- Bridge credentials: \`SANDBOX_API_URL\` and \`SANDBOX_API_KEY\`.
- Repository live verifier: \`CLOUDFLARE_SANDBOX_WORKER_URL\` and \`CLOUDFLARE_SANDBOX_TOKEN\`.

## CodeSandbox (@sandbox-sdk/codesandbox)

CodeSandbox microVMs via \`@codesandbox/sdk\`. Creates or resumes sandboxes, connects a session, and normalizes files, commands, background commands, and opened ports. Use \`template\` to fork from a template, \`snapshot\` to fork from a snapshot, or \`id\` to resume an existing sandbox.

- \`token\`, \`template\`, \`stop\` (\`shutdown\` default, or \`hibernate\`, \`disconnect\`, \`delete\`).
- Credentials: \`CSB_API_KEY\`.

## Daytona (@sandbox-sdk/daytona)

Daytona dev environments via \`@daytona/sdk\`. Spins up a workspace from the given image, mounts a workdir, and threads files and processes through Daytona's API. Standard private preview URLs require the native preview token in an \`x-daytona-preview-token\` header. Set \`signedPreview\` for a self-contained URL. Network limits are configured at creation time; native \`raw.updateNetworkSettings()\` is available when the account tier supports runtime changes.

- \`image\`, \`apiKey\`, \`target\`, \`networkBlockAll\`, \`networkAllowList\`.
- Credentials: \`DAYTONA_API_KEY\`.

## E2B (@sandbox-sdk/e2b)

E2B microVM sandboxes via \`e2b\`. Can pin a template at construction and threads writes, commands, ports, and snapshots through the E2B SDK. E2B snapshots capture filesystem and memory state, briefly pausing the source sandbox and dropping active command, PTY, and WebSocket connections. Use the shared \`snapshot\` create option to start a fresh sandbox from a snapshot id. \`ports.expose()\` returns E2B's derived HTTP or HTTPS URL. When \`network.allowPublicTraffic\` is false, send \`sandbox.raw.trafficAccessToken\` in the \`e2b-traffic-access-token\` request header.

- \`template\`, \`apiKey\`, \`timeout\`.
- Credentials: \`E2B_API_KEY\` or \`E2B_ACCESS_TOKEN\`.

## Modal (@sandbox-sdk/modal)

Modal sandboxes via \`modal\`. Creates sandboxes inside a Modal app, maps file reads and writes through Modal's filesystem, and exposes provider-declared HTTPS ports through Modal tunnels. Reconnecting by sandbox id discovers existing tunnels automatically. Use Modal create options and \`sandbox.raw\` for provider-specific private and direct TCP tunnel controls. Supports filesystem snapshot creation; in-place restore and background process handles stay unsupported until the provider exposes a matching stable primitive.

- \`app\` (defaults to \`sandbox-sdk\`), \`image\`, \`ports\`.
- Credentials: \`MODAL_TOKEN_ID\` and \`MODAL_TOKEN_SECRET\`, or Modal CLI config.

## Vercel (@sandbox-sdk/vercel)

Vercel via \`@vercel/sandbox\`. Backed by Fluid Compute: named, persistent microVMs with snapshots, dynamic ports, network policy, sessions, interactive PTY connections, and provider-native lifecycle controls. Use \`snapshot\` to start from a snapshot id, or \`snapshots.restore()\` to point the current named sandbox at a snapshot.

- \`runtime\` (\`node26\`, \`node24\`, \`node22\`, \`python3.13\`), \`name\`, \`getOrCreate\`, \`fork\`, \`teamId\`, \`projectId\`, \`token\`, \`ports\`, \`keepLastSnapshots\`.
- Credentials: \`VERCEL_OIDC_TOKEN\`, or \`VERCEL_TOKEN\` with team and project ids.`;

const capabilities = `# Capabilities

Every adapter declares a typed \`capabilities\` map. Branch on it at runtime with \`supports()\`, or read \`sandbox.capabilities\` at design time, instead of discovering provider differences in production.

\`\`\`ts
import { supports } from "@sandbox-sdk/core";

if (supports(sandbox, "ports")) {
  const preview = await sandbox.ports.expose(3000);
  console.log(preview.url);
}

if (supports(sandbox, "snapshotCreate")) {
  const snapshot = await sandbox.snapshots.create("ready");
  console.log(snapshot.id);
}
\`\`\`

Normalized capability flags include \`files\`, \`process\`, \`processExec\`, \`processSpawn\`, \`ports\`, \`snapshots\`, \`snapshotCreate\`, \`snapshotRestore\`, \`snapshotSource\`, \`environment\`, and \`streaming\`. Provider-specific powers are listed under \`capabilities.raw\` and reached through \`sandbox.raw\`.

\`capabilityMode(sandbox, capability)\` returns how a feature works when it exists but has a provider-specific shape, for example \`"disk"\` versus \`"memory"\` snapshots, or \`"separate"\` versus \`"combined"\` output streams. \`sandbox.capabilities\` is the runtime source of truth for a given provider.`;

const files = `# Files

Filesystem operations are scoped to the sandbox root. The local adapter rejects any path that escapes the root with \`SandboxError\` and \`code: "path_escape"\`.

\`\`\`ts
await sandbox.files.mkdir("/workspace/src");
await sandbox.files.write("/workspace/src/index.ts", "console.log('hello')");

const text = await sandbox.files.text("/workspace/src/index.ts");
const stream = await sandbox.files.stream("/workspace/src/index.ts");
const entries = await sandbox.files.list("/workspace/src");

await sandbox.files.remove("/workspace/src/index.ts");
\`\`\`

- \`files.read(path)\` returns raw \`Uint8Array\` bytes. \`files.text(path)\` decodes as UTF-8.
- \`files.stream(path)\` returns \`ReadableStream<Uint8Array>\`. Use it for large files or when forwarding bytes without buffering the whole file in memory.
- \`files.write(path, input)\` creates parent directories as needed and accepts \`string\`, \`Uint8Array\`, \`ArrayBuffer\`, \`Blob\`, or \`ReadableStream<Uint8Array>\`. Streams are drained before the write completes.
- \`files.list(path?)\` lists the immediate children of \`path\` (defaults to the sandbox cwd) as a sorted, frozen array of \`Entry\` values, each with \`path\`, \`kind\`, plus \`size\` and \`modified\` where cheap.
- \`files.exists(path)\` returns \`true\` when a path exists.
- \`files.mkdir(path)\` creates a directory and missing parents.
- \`files.remove(path)\` removes a file or directory recursively where supported. Catch \`SandboxError\` with \`code: "not_found"\` or \`code: "provider"\` when deleting optional paths.`;

const processes = `# Processes

Run commands one-shot with buffered output, or spawn a background handle and stream output.

\`\`\`ts
const result = await sandbox.process.shell("bun test", {
  cwd: "/workspace",
  timeout: 60_000,
});

if (!result.ok) {
  throw new Error(result.stderr);
}

console.log(result.stdout);
\`\`\`

- \`process.shell(command, options?)\` runs a shell command string to completion.
- \`process.exec(command, args?, options?)\` runs an executable with explicit argv arguments.
- \`process.spawn(command, args?, options?)\` and \`process.spawnShell(command, options?)\` return a handle immediately. Use \`output\` to stream merged stdout and stderr, optional \`stdout\` and \`stderr\` when the provider exposes separate streams, \`kill()\` to terminate, and \`result\` for the final \`{ code, signal?, stdout, stderr }\`.

Options shared by all four: \`cwd\`, \`env\` (a \`Record<string, string>\`), \`timeout\` in milliseconds, and \`signal\` for \`AbortSignal\` cancellation. On timeout the adapter kills the process and rejects with \`SandboxError\` carrying the partial output. Background spawn is only available where \`processSpawn\` is supported.`;

const ports = `# Ports

Expose a port running inside the sandbox and get its provider-derived URL. Local sandboxes return derived localhost URLs; provider adapters may return public tunnels or create-time port URLs, or reject unsupported exposure. Branch on \`sandbox.capabilities.ports\` first.

\`\`\`ts
const result = await sandbox.process.shell("bun dev --host 0.0.0.0", {
  cwd: "/workspace",
  timeout: 1_000,
});

if (!result.ok && !supports(sandbox, "processSpawn")) {
  throw new Error(result.stderr);
}

const preview = await sandbox.ports.expose(3000);
console.log(preview.url);
\`\`\`

\`ports.expose(port, options?)\` returns \`{ url, port }\`. Options are provider-specific and unsupported values throw at \`expose()\` time:

- \`host\`: custom preview host when the adapter supports it.
- \`protocol\`: \`"http"\`, \`"https"\`, or \`"tcp"\`. Consult the adapter docs for supported protocols; \`capabilities.ports\` describes port exposure mode, not protocol support.
- \`token\`: provider-issued preview URL token when the adapter supports it. Use \`sandbox.raw\` for provider-specific preview controls.`;

const snapshots = `# Snapshots

Snapshot support is capability-gated because providers expose different lifecycle shapes. Some providers pause or stop a sandbox while creating a snapshot, so treat creation as a lifecycle operation rather than a transparent file copy.

\`\`\`ts
if (supports(sandbox, "snapshotCreate")) {
  const snapshot = await sandbox.snapshots.create("after-install");

  await withSandbox(
    {
      adapter: vercel(),
      snapshot: snapshot.id,
    },
    async (fresh) => {
      console.log(await fresh.files.list());
    }
  );
}
\`\`\`

- \`snapshots.create(name?)\` captures provider state when \`snapshotCreate\` is supported.
- \`snapshots.restore(id)\` means in-place restore of the current sandbox, gated separately by \`snapshotRestore\`.
- To create a fresh sandbox from a snapshot, pass the snapshot id as the \`snapshot\` create option on adapters that advertise \`snapshotSource\`. Provider template ids still use \`template\`.`;

const sandboxType = `# The Sandbox type

\`Sandbox\` is a frozen record of the capability namespaces (\`files\`, \`process\`, \`ports\`, \`snapshots\`, \`raw\`) plus identifiers and a lifecycle hook. \`capabilities\` declares what the underlying provider can do through the normalized API. Provider-specific powers live under \`capabilities.raw\` and are available through \`sandbox.raw\`.

\`\`\`ts
type Sandbox<Raw = unknown> = Readonly<{
  capabilities: Capabilities;
  cwd: string;
  files: Files;
  id: string;
  process: Process;
  provider: string;
  ports: Ports;
  raw: Raw;
  snapshots: Snapshots;
  stop(): Promise<void>;
}>;
\`\`\`

The \`Raw\` type parameter is set per adapter (the local adapter sets it to \`{ root: string }\`; cloud adapters set it to their native client) so \`sandbox.raw\` stays autocomplete-friendly without losing the unified shape.`;

const errors = `# Errors

Normalized SDK methods throw \`SandboxError\` with a normalized \`code\` and the provider name on \`provider\`. When a provider failure is wrapped, the original provider error is attached as \`cause\`. Native calls through \`sandbox.raw\` keep native provider errors. Use \`isSandboxError(error)\` to narrow.

Codes:

- \`"unsupported"\`: the adapter does not implement the method. Branch on \`capabilities\` to avoid this path.
- \`"path_escape"\`: a file or \`cwd\` path resolved outside the sandbox root. Always thrown by the local adapter's safety check.
- \`"not_found"\`: referenced path or snapshot id does not exist.
- \`"timeout"\`: \`process.shell\` or \`process.exec\` hit \`options.timeout\`; partial output is attached to \`cause\`.
- \`"aborted"\`: caller cancellation through \`options.signal\`.
- \`"configuration"\`: invalid or missing adapter configuration.
- \`"policy"\`: a policy hook rejected the operation.
- \`"process"\`: a process failed in a way the adapter classifies separately.
- \`"provider"\`: anything else. Inspect \`cause\` for the underlying error.`;

const escapeHatch = `# Raw escape hatch

When you need a feature outside the unified surface, like provider-specific networking, GPU attach, custom snapshots, or container internals, drop down to the native client. The \`raw\` property is typed per adapter so you keep autocomplete, while the rest of your agent loop stays portable.

\`\`\`ts
const sandbox = await create({
  adapter: vercel({ runtime: "node24" }),
});

await sandbox.raw.update({
  ports: [3000, 3001],
});
\`\`\`

Raw access is intentionally powerful and belongs in trusted host code. The capabilities reachable through \`raw\` are listed per adapter under \`capabilities.raw\`.`;

const aiTools = `# AI tools

\`@sandbox-sdk/ai\` wraps a configured sandbox into ready-made tools for agent frameworks. The kit includes prompt context plus file, command, directory, and preview tools, and an AI SDK-compatible sandbox object with JSON-schema inputs. Each tool is a thin shim around \`files\`, \`process\`, and \`ports\` on the underlying sandbox.

\`\`\`bash
bun add @sandbox-sdk/ai
\`\`\`

Pass a configured sandbox into \`tools()\`. The return value is prompt context and a record of tool definitions, each with a \`description\`, \`inputSchema\`, and \`execute\` function.

- \`read\`: reads a UTF-8 text file at \`{ path }\` through \`sandbox.files.text()\`. Returns \`{ text }\`.
- \`list\`: lists directory entries at \`{ path }\` through \`sandbox.files.list()\`.
- \`write\`: writes \`{ path, text }\` via \`sandbox.files.write()\`. Returns \`{ ok: true }\`.
- \`exec\`: runs \`{ command, args?, cwd? }\` through \`sandbox.process.shell()\` (or \`exec()\` when \`args\` is given). Returns the buffered \`{ code, stdout, stderr }\`.
- \`preview\`: exposes a port with \`sandbox.ports.expose()\` and returns the reachable URL, available only when the provider supports ports.

The kit also returns prompt context describing the sandbox, its workspace path, and the safety boundaries, ready to drop into the agent's system prompt.

## Vercel AI SDK

\`aisdk()\` returns the shape used by Vercel AI SDK: \`system\`, \`tools\`, and \`experimental_sandbox\`. The same tool definitions work with \`generateText\`, \`streamText\`, and agent loops. With AI Gateway, pass a \`provider/model\` string directly as \`model\`.

\`\`\`ts
import { aisdk, tools } from "@sandbox-sdk/ai";
import { withSandbox } from "@sandbox-sdk/core";
import { vercel } from "@sandbox-sdk/vercel";
import { generateText, stepCountIs } from "ai";

await withSandbox(
  {
    adapter: vercel({ runtime: "node24" }),
    cwd: "/vercel/sandbox",
  },
  async (sandbox) => {
    const kit = tools(sandbox, {
      allow: ["read", "write", "list"],
      cwd: "/vercel/sandbox",
    });

    const result = await generateText({
      model: "openai/gpt-5.4-nano",
      ...aisdk(kit),
      prompt: "write a hello.txt file and read it back",
      stopWhen: stepCountIs(5),
    });

    return result.text;
  }
);
\`\`\`

## OpenAI Agents SDK

Install \`@openai/agents\` and import \`@sandbox-sdk/ai/openai\`. The adapter uses the real OpenAI \`tool()\` helper, emits JSON-schema parameters, names tools with a \`sandbox_\` prefix by default, and requires approval for side-effect tools unless you opt into autonomous execution.

## Claude Agent SDK

Install \`@anthropic-ai/claude-agent-sdk\` and import \`@sandbox-sdk/ai/claude\`. Claude custom tools run through an in-process MCP server, so the adapter returns \`mcpServers\`, \`allowedTools\`, \`canUseTool\`, and prompt context for \`systemPrompt\`. Read-only tools are annotated as safe; \`write\`, \`exec\`, and \`preview\` require approval by default. Use \`{ requireApproval: false }\` only for disposable sandboxes.

## Safety model

- \`read\` and \`list\` are safe by default.
- \`write\`, \`exec\`, and \`preview\` are side-effect tools and must be enabled explicitly.
- Side-effect tools can run policy hooks before execution.
- Provider credentials stay in host env, never sandbox env.
- Raw access is intentionally powerful and belongs in trusted host code.

\`\`\`ts
const kit = tools(sandbox, {
  allow: ["read", "write", "list", "exec"],
  beforeExec(input) {
    if (input.command.includes("rm -rf")) {
      throw new Error("command rejected");
    }
  },
  beforeWrite(input) {
    if (!input.path.startsWith("/workspace/")) {
      throw new Error("writes must stay in /workspace");
    }
  },
});
\`\`\``;

const verification = `# Verification

Every adapter is verified against the live provider, not just mocked. Sanitized fixtures give fast contract replay in \`bun test\`; the \`verify:*\` scripts run the same suite against real sandboxes and are the source of truth for provider behavior. They print readiness without leaking secret values.

\`\`\`bash
# check which provider credentials are present
bun run verify:env

# run the full live suite across every provider
bun run verify:providers

# verify a single provider end to end
bun run verify:vercel
bun run verify:cloudflare
bun run verify:e2b
\`\`\`

Each provider has its own script: \`verify:blaxel\`, \`verify:cloudflare\`, \`verify:codesandbox\`, \`verify:daytona\`, \`verify:e2b\`, \`verify:modal\`, and \`verify:vercel\`. Credentials are read from \`.env.local\` and stay in host env, never sandbox env.`;

const api = `# API reference

Every method lives on the \`Sandbox\` instance returned by \`create()\`. The unified surface only covers what every adapter can do cleanly; anything provider-specific lives on \`sandbox.raw\`. The complete generated reference, including every type, lives at https://github.com/dancer/sandbox/blob/main/docs/api.md.

## Lifecycle

- \`create(options)\` creates or connects to a sandbox and returns a typed \`Sandbox\`.
- \`withSandbox(options, fn)\` runs \`fn\` with a sandbox and stops it after success or failure.

## Capability checks

- \`supports(sandbox, capability)\` returns \`true\` when a normalized capability is available.
- \`capabilityMode(sandbox, capability)\` returns the provider-specific mode for a capability.
- \`supportsRaw(sandbox, capability)\` and \`rawCapabilityMode(sandbox, capability)\` do the same for \`capabilities.raw\`.
- \`requireCapability(sandbox, capability)\` and \`requireRawCapability(sandbox, capability)\` throw \`SandboxError\` with \`code: "unsupported"\` when a capability is missing.

## Errors

- \`SandboxError\` is the single normalized error class, carrying \`code\`, \`provider\`, and \`cause\`.
- \`isSandboxError(error)\` narrows unknown values to \`SandboxError\`.

## Adapter authoring

- \`fromSandboxRuntime(runtime)\` lifts a low-level \`SandboxRuntime\` into the public \`Sandbox\` API, deriving \`files.text()\`, \`files.read()\`, \`process.exec()\`, and \`process.shell()\` from the stream-first contract.

Core types include \`Sandbox\`, \`Capabilities\`, \`Capability\`, \`Mode\`, \`Files\`, \`Process\`, \`Running\`, \`Ports\`, \`Snapshots\`, \`Result\`, \`Entry\`, \`Input\`, \`Options\`, \`Adapter\`, \`SandboxRuntime\`, and \`Code\`.`;

export const docs: readonly Doc[] = [
  {
    body: why,
    slug: "why",
    summary: "the problem one small API across providers solves",
    title: "Why a contract",
  },
  {
    body: installation,
    slug: "installation",
    summary: "install core plus the adapter you run against",
    title: "Installation",
  },
  {
    body: quickStart,
    slug: "quick-start",
    summary: "withSandbox gives a typed sandbox with safe cleanup",
    title: "Quick start",
  },
  {
    body: adapters,
    slug: "adapters",
    summary: "the eight providers and how to configure each",
    title: "Adapters",
  },
  {
    body: capabilities,
    slug: "capabilities",
    summary: "branch on normalized support instead of guessing",
    title: "Capabilities",
  },
  {
    body: files,
    slug: "files",
    summary: "read, stream, write, list, and remove",
    title: "Files",
  },
  {
    body: processes,
    slug: "processes",
    summary: "one-shot exec and shell, plus streaming spawn handles",
    title: "Processes",
  },
  {
    body: ports,
    slug: "ports",
    summary: "expose a sandbox port and get a reachable URL",
    title: "Ports",
  },
  {
    body: snapshots,
    slug: "snapshots",
    summary: "capability-gated state capture and restore",
    title: "Snapshots",
  },
  {
    body: sandboxType,
    slug: "sandbox-type",
    summary: "the shape every adapter returns",
    title: "The Sandbox type",
  },
  {
    body: errors,
    slug: "errors",
    summary: "one SandboxError with a normalized code",
    title: "Errors",
  },
  {
    body: escapeHatch,
    slug: "escape-hatch",
    summary: "drop down to the native provider client",
    title: "Raw escape hatch",
  },
  {
    body: aiTools,
    slug: "ai-tools",
    summary: "wrap a sandbox into agent framework tools",
    title: "AI tools",
  },
  {
    body: verification,
    slug: "verification",
    summary: "every adapter is verified against the live provider",
    title: "Verification",
  },
  {
    body: api,
    slug: "api",
    summary: "the full public surface and where to find every type",
    title: "API reference",
  },
];

const docUrl = (slug: string): string => `${site.baseUrl}/${slug}.md`;

export const llmsIndex = (): string => {
  const links = docs
    .map((doc) => `- [${doc.title}](${docUrl(doc.slug)}): ${doc.summary}`)
    .join("\n");

  return `# ${site.name}

> ${site.summary}

Swap one adapter import to target a provider and keep the rest of your agent loop the same. Each page below is plain markdown.

## Docs

${links}

## Full

- [Complete documentation](${site.baseUrl}/llms-full.txt): every page concatenated into one file

## Links

- [Website](${site.baseUrl})
- [GitHub](${site.github})
`;
};

export const llmsFull = (): string => {
  const bodies = docs.map((doc) => doc.body).join("\n\n---\n\n");

  return `# ${site.name}

> ${site.summary}

${bodies}
`;
};

export const findDoc = (slug: string): Doc | undefined =>
  docs.find((doc) => doc.slug === slug);
