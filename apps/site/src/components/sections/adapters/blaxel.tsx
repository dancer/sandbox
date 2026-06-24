import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";
import { PropAccordionItem } from "@/components/prop-accordion-item";
import { Accordion } from "@/components/ui/accordion";

const BLAXEL_EXAMPLE = `import { create } from "@sandbox-sdk/core";
import { blaxel } from "@sandbox-sdk/blaxel";

const sandbox = await create({
  adapter: blaxel({
    image: "blaxel/base-image:latest",
  }),
  cwd: "/app",
});`;

export const Blaxel = () => (
  <section>
    <Heading as="h3" id="adapter-blaxel">
      Blaxel
    </Heading>
    <p>
      Blaxel perpetual sandboxes via <code>@blaxel/core</code>. The adapter maps
      Blaxel files, process execution, background processes, and preview URLs
      onto the shared Sandbox SDK surface.
    </p>
    <p>
      Pass <code>apiKey</code> and <code>workspace</code> explicitly for
      deterministic auth, or let the Blaxel SDK use <code>BL_API_KEY</code>,{" "}
      <code>BL_CLIENT_CREDENTIALS</code>, <code>BL_WORKSPACE</code>, or the
      Blaxel CLI config.
    </p>
    <p>
      Treat native client session tokens as bearer credentials and create them
      on a trusted backend. Agent Drive is a private-preview workspace-wide
      feature, so <code>drivePath</code> and <code>readOnly</code> mounts are
      not authorization boundaries for untrusted sandbox code. Restrict access
      to the drive identity token and <code>blfs</code> when that boundary
      matters.
    </p>
    <CodeBlock code={BLAXEL_EXAMPLE} lang="ts" />
    <div className="flex flex-col gap-2">
      <Heading as="h4" id="adapter-blaxel-options">
        Options
      </Heading>
      <Accordion className="rounded-md border-dotted" type="multiple">
        <PropAccordionItem name="image" status="optional" value="image">
          <p>
            Container image for new sandboxes. Defaults to Blaxel's base image
            when omitted by the provider SDK.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="workspace" status="optional" value="workspace">
          <p>
            Blaxel workspace name. Required when passing explicit API key or
            client credential auth.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="ports" status="optional" value="ports">
          <p>
            Ports declared at creation time for sandbox API access. Preview URLs
            through <code>ports.expose()</code> can be created dynamically.
          </p>
        </PropAccordionItem>
      </Accordion>
    </div>
  </section>
);
