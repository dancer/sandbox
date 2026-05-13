import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";
import { PropAccordionItem } from "@/components/prop-accordion-item";
import { Accordion } from "@/components/ui/accordion";

const DAYTONA_EXAMPLE = `import { create } from "@sandbox-sdk/core";
import { daytona } from "@sandbox-sdk/daytona";

const sandbox = await create({
  adapter: daytona({
    image: "ubuntu:22.04",
    // apiKey auto-loaded from DAYTONA_API_KEY
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
        <PropAccordionItem name="image" status="required" value="image">
          <p>
            Container image the workspace is built from (e.g.{" "}
            <code>ubuntu:22.04</code>). Pulled by Daytona on first use.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="apiKey" status="optional" value="apiKey">
          <p>
            Daytona API key. Falls back to <code>DAYTONA_API_KEY</code>;
            required if no env var is set.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="region" status="optional" value="region">
          <p>
            Daytona region for the workspace. Falls back to the account default.
          </p>
        </PropAccordionItem>
      </Accordion>
    </div>
  </section>
);
