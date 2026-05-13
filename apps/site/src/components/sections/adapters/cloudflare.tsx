import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";
import { PropAccordionItem } from "@/components/prop-accordion-item";
import { Accordion } from "@/components/ui/accordion";

const CLOUDFLARE_EXAMPLE = `import { create } from "@sandbox-sdk/core";
import { cloudflare } from "@sandbox-sdk/cloudflare";

// inside a worker the binding is passed in from env
export default {
  async fetch(_request: Request, env: { SANDBOX: DurableObjectNamespace }) {
    const sandbox = await create({
      adapter: cloudflare({ binding: env.SANDBOX }),
    });

    await sandbox.files.write("main.ts", "console.log('hello')");
    const result = await sandbox.process.exec("bun", ["main.ts"]);

    return new Response(result.stdout);
  },
};`;

export const Cloudflare = () => (
  <section>
    <Heading as="h3" id="adapter-cloudflare">
      Cloudflare Sandbox
    </Heading>
    <p>
      Cloudflare Sandbox via <code>@cloudflare/sandbox</code>. Backed by a
      Durable Object running a Linux container, so the adapter takes a binding
      from <code>env</code> rather than an API key, and all I/O stays on
      Cloudflare's network.
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
            <code>wrangler.toml</code>. The adapter calls{" "}
            <code>idFromName()</code> / <code>get()</code> to materialize a stub
            when <code>create()</code> runs.
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
