import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";
import { PropAccordionItem } from "@/components/prop-accordion-item";
import { Accordion } from "@/components/ui/accordion";

const DAYTONA_EXAMPLE = `import { create } from "@sandbox-sdk/core";
import { daytona } from "@sandbox-sdk/daytona";

const sandbox = await create({
  adapter: daytona({
    image: "ubuntu:22.04",
  }),
});`;

export const Daytona = () => (
  <section>
    <Heading as="h3" id="adapter-daytona">
      Daytona
    </Heading>
    <p>
      Daytona dev environments via <code>@daytonaio/sdk</code>. The adapter
      spins up a workspace from the given image, mounts a workdir, and threads
      files and processes through Daytona's API.
    </p>
    <CodeBlock code={DAYTONA_EXAMPLE} lang="ts" />
    <div className="flex flex-col gap-2">
      <Heading as="h4" id="adapter-daytona-options">
        Options
      </Heading>
      <Accordion className="rounded-md border-dotted" type="multiple">
        <PropAccordionItem name="image" status="optional" value="image">
          <p>
            Container image the workspace is built from (e.g.{" "}
            <code>ubuntu:22.04</code>). Pulled by Daytona on first use.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="apiKey" status="optional" value="apiKey">
          <p>
            Daytona API key passed to the native SDK. Omit it to use the
            provider SDK's environment-based defaults.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="target" status="optional" value="target">
          <p>
            Daytona target for workspace placement. Falls back to the native SDK
            default when omitted.
          </p>
        </PropAccordionItem>
      </Accordion>
    </div>
  </section>
);
