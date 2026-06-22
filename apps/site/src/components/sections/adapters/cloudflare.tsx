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
  async fetch(_request: Request, env: Env) {
    const sandbox = await create({
      adapter: cloudflare({ binding: env.Sandbox }),
      cwd: "/workspace",
    });

    await sandbox.files.write("/workspace/main.ts", "console.log('hello')");

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
      <code>tunnel</code> when you need a stable named tunnel backed by your
      Cloudflare zone.
    </p>
    <CodeBlock code={CLOUDFLARE_EXAMPLE} lang="ts" />
    <p>
      For Node apps and other non-Worker runtimes, deploy Cloudflare's HTTP
      bridge and use <code>cloudflareBridge()</code>. It keeps normalized files,
      command execution, and HTTPS tunnel previews available over HTTP.
      <code>ports.expose()</code> creates a zero-config quick tunnel by default;
      set <code>tunnel</code> to request a named tunnel when the bridge Worker
      has the required Cloudflare account and zone credentials. Bridge working
      directories stay below <code>/workspace</code>, so relative values resolve
      there, custom directories are created, and external paths fail before a
      bridge request. Bridge lifecycle, sessions, persist, hydrate, bucket
      mounts, warm-pool controls, health, OpenAPI schema access, and raw tunnel
      controls stay typed on <code>sandbox.raw</code>. PTY support returns a
      typed WebSocket connection descriptor so your app can own the terminal
      client and start a long-running service before calling{" "}
      <code>ports.expose()</code>. The bridge HTTP API does not expose a
      lifecycle-safe background process endpoint, so{" "}
      <code>process.spawn()</code> stays unavailable.{" "}
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
            DNS label used for named tunnels created by{" "}
            <code>ports.expose()</code>. Omit it for a zero-config{" "}
            <code>trycloudflare.com</code> quick tunnel.
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
