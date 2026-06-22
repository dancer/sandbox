import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";
import { PropAccordionItem } from "@/components/prop-accordion-item";
import { Accordion } from "@/components/ui/accordion";

const VERCEL_EXAMPLE = `import { create } from "@sandbox-sdk/core";
import { vercel } from "@sandbox-sdk/vercel";

const sandbox = await create({
  adapter: vercel({
    runtime: "node24",
  }),
});

const preview = await sandbox.ports.expose(3000);`;

export const Vercel = () => (
  <section>
    <Heading as="h3" id="adapter-vercel">
      Vercel
    </Heading>
    <p>
      Vercel via <code>@vercel/sandbox</code>. Backed by Vercel's Fluid Compute:
      named, persistent microVMs with snapshots, dynamic ports, network policy,
      sessions, interactive PTY connections, and provider-native lifecycle
      controls. The adapter normalizes files, commands, ports, and snapshots
      while keeping the full Vercel SDK on <code>raw</code>.
    </p>
    <p>
      Use <code>snapshot</code> to start from a snapshot id, or{" "}
      <code>snapshots.restore()</code> to point the current named sandbox at a
      snapshot and resume from it on the next operation. Call{" "}
      <code>snapshots.delete()</code> to permanently remove a durable snapshot
      after its dependents have been created. Deleting the current snapshot of a
      stopped named sandbox makes the next <code>getOrCreate()</code> rebuild
      it.
    </p>
    <p>
      Command timeouts are enforced inside the sandbox and backed by local
      cancellation. Use <code>raw.openInteractive()</code> when an application
      needs Vercel's native controller-backed PTY connection.
    </p>
    <CodeBlock code={VERCEL_EXAMPLE} lang="ts" />
    <div className="flex flex-col gap-2">
      <Heading as="h4" id="adapter-vercel-options">
        Options
      </Heading>
      <Accordion className="rounded-md border-dotted" type="multiple">
        <PropAccordionItem name="runtime" status="optional" value="runtime">
          <p>
            Vercel Sandbox runtime. Supported runtime ids include{" "}
            <code>node26</code>, <code>node24</code>, <code>node22</code>, and{" "}
            <code>python3.13</code>. Forks inherit their source runtime and do
            not accept this option.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="name" status="optional" value="name">
          <p>
            Named sandbox to create or reuse with <code>getOrCreate</code>.
            Names make Vercel sandboxes resumable across processes.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="getOrCreate" status="optional" value="boolean">
          <p>
            Use Vercel's native <code>Sandbox.getOrCreate()</code> flow for
            idempotent named sandbox setup.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="fork" status="optional" value="fork">
          <p>
            Fork from an existing named Vercel sandbox. Stop or snapshot the
            source first to copy its filesystem. Fork cannot be combined with
            <code>runtime</code>, <code>source</code>, <code>getOrCreate</code>,
            or create input <code>id</code>, <code>snapshot</code>, or{" "}
            <code>template</code>.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="teamId" status="optional" value="teamId">
          <p>
            Vercel team id passed to the native SDK. Omit it to use the provider
            SDK's environment-based defaults.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="projectId" status="optional" value="projectId">
          <p>
            Vercel project id passed to the native SDK. Omit it to use the
            provider SDK's environment-based defaults.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="token" status="optional" value="token">
          <p>
            Vercel access token passed to the native SDK. Omit it to use the
            provider SDK's environment-based defaults.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="ports" status="optional" value="ports">
          <p>
            Ports to expose immediately. <code>ports.expose()</code> can add new
            ports later through Vercel's dynamic sandbox update API.
          </p>
        </PropAccordionItem>
        <PropAccordionItem
          name="keepLastSnapshots"
          status="optional"
          value="policy"
        >
          <p>
            Vercel snapshot retention policy for named sandboxes. Use this to
            cap stored snapshots while keeping fast restore workflows.
          </p>
        </PropAccordionItem>
      </Accordion>
    </div>
  </section>
);
