import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";
import { PropAccordionItem } from "@/components/prop-accordion-item";
import { Accordion } from "@/components/ui/accordion";

const VERCEL_EXAMPLE = `import { create } from "@sandbox-sdk/core";
import { vercel } from "@sandbox-sdk/vercel";

const sandbox = await create({
  adapter: vercel({
    runtime: "node22",
  }),
});`;

export const Vercel = () => (
  <section>
    <Heading as="h3" id="adapter-vercel">
      Vercel
    </Heading>
    <p>
      Vercel via <code>@vercel/sandbox</code>. Backed by Vercel's Fluid Compute:
      ephemeral, region-local, hot-pooled. The adapter can pin a runtime at
      construction and exposes ports through Vercel's built-in tunneling.
    </p>
    <CodeBlock code={VERCEL_EXAMPLE} lang="ts" />
    <div className="flex flex-col gap-2">
      <Heading as="h4" id="adapter-vercel-options">
        Options
      </Heading>
      <Accordion className="rounded-md border-dotted" type="multiple">
        <PropAccordionItem name="runtime" status="optional" value="runtime">
          <p>
            Vercel Sandbox runtime (e.g. <code>node22</code>,{" "}
            <code>python3.12</code>). Determines the base image and the
            available system packages.
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
      </Accordion>
    </div>
  </section>
);
