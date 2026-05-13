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
    const { hostname } = new URL(request.url);
    const sandbox = await create({
      adapter: cloudflare({ binding: env.Sandbox, hostname }),
      cwd: "/workspace",
    });

    await sandbox.files.write("/workspace/main.ts", "console.log('hello')");

    const result = await sandbox.process.shell("bun /workspace/main.ts");

    return new Response(result.stdout);
  },
};`;

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
      <code>wrangler.jsonc</code>. Port previews require a custom domain with
      wildcard routing in production; <code>.workers.dev</code> is fine for file
      and command validation but not production preview URLs.
    </p>
    <CodeBlock code={CLOUDFLARE_EXAMPLE} lang="ts" />
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
        <PropAccordionItem name="hostname" status="optional" value="hostname">
          <p>
            Hostname used to construct preview URLs when calling{" "}
            <code>ports.expose()</code>. In production, this must be a custom
            domain with wildcard routing configured for Cloudflare Sandbox
            preview URLs.
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
