import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";
import { PropAccordionItem } from "@/components/prop-accordion-item";
import { Accordion } from "@/components/ui/accordion";

const CLOUDFLARE_EXAMPLE = `import type { Sandbox as CloudflareSandbox } from "@cloudflare/sandbox";
import { create } from "@sandbox-sdk/core";
import { cloudflare } from "@sandbox-sdk/cloudflare";

export { Sandbox } from "@cloudflare/sandbox";

type Env = {
  Sandbox: DurableObjectNamespace<CloudflareSandbox>;
};

export default {
  async fetch(request: Request, env: Env) {
    const sandbox = await create({
      adapter: cloudflare({ binding: env.Sandbox }),
      cwd: "/workspace",
    });

    await sandbox.files.write("/workspace/main.ts", "console.log('hello')");

    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      return sandbox.raw.wsConnect(request, 8080);
    }

    const result = await sandbox.process.shell("bun /workspace/main.ts");

    return new Response(result.stdout);
  },
};`;

const CLOUDFLARE_BRIDGE_EXAMPLE = `import { create } from "@sandbox-sdk/core";
import { cloudflareBridge } from "@sandbox-sdk/cloudflare";

const sandbox = await create({
  adapter: cloudflareBridge({
    url: process.env.SANDBOX_API_URL,
    token: process.env.SANDBOX_API_KEY,
  }),
});

await sandbox.files.write("/workspace/main.ts", "console.log('hello')");

const result = await sandbox.process.shell("bun /workspace/main.ts");

console.log(result.stdout);`;

const CLOUDFLARE_BACKUPS_EXAMPLE = `const sandbox = await create({
  adapter: cloudflare({
    binding: env.Sandbox,
    backups: {
      useGitignore: true,
      ttl: 86_400,
    },
  }),
  cwd: "/workspace",
});

const snapshot = await sandbox.snapshots.create("before-upgrade");

await sandbox.snapshots.restore(snapshot.id);`;

export const Cloudflare = () => (
  <section>
    <Heading as="h3" id="adapter-cloudflare">
      Cloudflare
    </Heading>
    <p>
      Cloudflare via <code>@cloudflare/sandbox</code>. Backed by a Durable
      Object running a Linux container, so the adapter takes a binding from{" "}
      <code>env</code> rather than an API key, and all I/O stays on Cloudflare's
      network.
    </p>
    <p>
      The Worker must export <code>Sandbox</code> from{" "}
      <code>@cloudflare/sandbox</code> and bind that Durable Object in{" "}
      <code>wrangler.jsonc</code>. The adapter uses Cloudflare's RPC transport
      and exposes ports through zero-config HTTPS tunnels. Set{" "}
      <code>tunnel</code> when one port needs a stable named tunnel, or use{" "}
      <code>tunnels</code> to map multiple ports to distinct labels in your
      Cloudflare zone. For Worker-managed WebSocket upgrades, use the typed
      native <code>sandbox.raw.wsConnect(request, port)</code> escape hatch.
    </p>
    <CodeBlock code={CLOUDFLARE_EXAMPLE} lang="ts" />
    <p>
      Set <code>backups</code> to opt into normalized filesystem snapshots
      through Cloudflare R2 backups. Add a <code>BACKUP_BUCKET</code> binding
      and, in production, the R2 presigned URL credentials to the Worker.
      Snapshot creation uses the adapter cwd and names are persisted in
      Cloudflare backup metadata. Restore writes back to that cwd. Production
      restores are copy-on-write mounts, so restore again after a sandbox sleeps
      or restarts. Configure an R2 lifecycle rule because backup TTL limits
      restoration but does not delete stored objects. Snapshot deletion and
      fresh sandbox creation from a backup stay unavailable through the
      normalized API.
    </p>
    <CodeBlock code={CLOUDFLARE_BACKUPS_EXAMPLE} lang="ts" />
    <p>
      For Node apps and other non-Worker runtimes, deploy Cloudflare's HTTP
      bridge and use <code>cloudflareBridge()</code>. It keeps normalized files,
      command execution, and HTTPS tunnel previews available over HTTP.
      <code>ports.expose()</code> creates a zero-config quick tunnel by default;
      set <code>tunnel</code> for one named port or <code>tunnels</code> for
      per-port labels when the bridge Worker has the required Cloudflare account
      and zone credentials. Bridge working directories stay below{" "}
      <code>/workspace</code>, so relative values resolve there, custom
      directories are created, and external paths fail before a bridge request.
      Bridge lifecycle, sessions, persist, hydrate, bucket mounts, warm-pool
      controls, health, OpenAPI schema access, and raw tunnel controls stay
      typed on <code>sandbox.raw</code>. PTY support returns a typed WebSocket
      connection descriptor so your app can own the terminal client and start a
      long-running service before calling <code>ports.expose()</code>. The
      bridge HTTP API does not expose a lifecycle-safe background process
      endpoint, so <code>process.spawn()</code> stays unavailable.{" "}
      <code>SANDBOX_API_KEY</code> authenticates the bridge and is rejected from
      sandbox environment configuration.
    </p>
    <CodeBlock code={CLOUDFLARE_BRIDGE_EXAMPLE} lang="ts" />
    <div className="flex flex-col gap-2">
      <Heading as="h4" id="adapter-cloudflare-options">
        Options
      </Heading>
      <Accordion className="rounded-md border-dotted" type="multiple">
        <PropAccordionItem name="binding" status="required" value="binding">
          <p>
            The Durable Object namespace binding wired to your Sandbox class in{" "}
            <code>wrangler.jsonc</code>. Pass the binding from{" "}
            <code>env.Sandbox</code>; the adapter materializes the sandbox with
            <code>@cloudflare/sandbox</code> when <code>create()</code> runs.
          </p>
        </PropAccordionItem>
        <PropAccordionItem
          name="backups"
          status="optional"
          value="CloudflareBackups"
        >
          <p>
            Enables R2-backed filesystem snapshot creation and in-place restore.
            The Worker needs a <code>BACKUP_BUCKET</code> binding. Production
            also needs <code>R2_ACCESS_KEY_ID</code>,{" "}
            <code>R2_SECRET_ACCESS_KEY</code>,{" "}
            <code>CLOUDFLARE_ACCOUNT_ID</code>, and{" "}
            <code>BACKUP_BUCKET_NAME</code>. The adapter controls the backup
            directory from <code>cwd</code> and the backup name from{" "}
            <code>snapshots.create(name?)</code>. Use <code>raw</code> when a
            restore needs a different directory or native backup handle.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="cwd" status="optional" value="/workspace">
          <p>
            Default working directory for files and commands. The native adapter
            passes it to Cloudflare. The HTTP bridge resolves relative values
            below <code>/workspace</code>, creates custom directories, and
            rejects external paths before a bridge request.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="tunnel" status="optional" value="string">
          <p>
            DNS label used for one named tunnel created by{" "}
            <code>ports.expose()</code>. With <code>tunnels</code>, it is a
            fallback for one unmapped port. Omit it for a zero-config{" "}
            <code>trycloudflare.com</code> quick tunnel.
          </p>
        </PropAccordionItem>
        <PropAccordionItem
          name="tunnels"
          status="optional"
          value="Record<number, string>"
        >
          <p>
            Named tunnel labels keyed by port. Use a distinct DNS label for each
            exposed port, for example{" "}
            <code>{'{ 3001: "api", 3002: "web" }'}</code>.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="id" status="optional" value="id">
          <p>
            Stable name used when resolving the Durable Object stub. Pass the
            same id to attach to an existing sandbox; omit for a fresh one keyed
            by <code>randomUUID()</code>.
          </p>
        </PropAccordionItem>
      </Accordion>
    </div>
  </section>
);
