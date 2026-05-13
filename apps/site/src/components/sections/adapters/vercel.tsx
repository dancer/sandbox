import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";
import { PropAccordionItem } from "@/components/prop-accordion-item";
import { Accordion } from "@/components/ui/accordion";

const VERCEL_EXAMPLE = `import { create } from "@sandbox-sdk/core";
import { vercelSandbox } from "@sandbox-sdk/vercel";

const sandbox = await create({
  adapter: vercelSandbox({
    runtime: "node22",
    // teamId / projectId / token auto-loaded from VERCEL_* env vars
  }),
});`;

export const Vercel = () => (
  <section>
    <Heading as="h3" id="adapter-vercel">
      Vercel Sandbox
    </Heading>
    <p>
      Vercel Sandbox via <code>@vercel/sandbox</code>. Backed by Vercel's Fluid
      Compute: ephemeral, region-local, hot-pooled. The adapter pins a runtime
      at construction and exposes ports through Vercel's built-in tunneling.
    </p>
    <CodeBlock code={VERCEL_EXAMPLE} lang="ts" />
    <div className="flex flex-col gap-2">
      <Heading as="h4" id="adapter-vercel-options">
        Options
      </Heading>
      <Accordion className="rounded-md border-dotted" type="multiple">
        <PropAccordionItem name="runtime" status="required" value="runtime">
          <p>
            Vercel Sandbox runtime (e.g. <code>node22</code>,{" "}
            <code>python3.12</code>). Determines the base image and the
            available system packages.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="teamId" status="optional" value="teamId">
          <p>
            Vercel team id. Falls back to <code>VERCEL_TEAM_ID</code>; required
            if no env var is set.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="projectId" status="optional" value="projectId">
          <p>
            Vercel project id. Falls back to <code>VERCEL_PROJECT_ID</code>;
            required if no env var is set.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="token" status="optional" value="token">
          <p>
            Vercel access token. Falls back to <code>VERCEL_TOKEN</code>;
            required if no env var is set.
          </p>
        </PropAccordionItem>
      </Accordion>
    </div>
  </section>
);
