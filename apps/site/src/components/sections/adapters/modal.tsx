import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";
import { PropAccordionItem } from "@/components/prop-accordion-item";
import { Accordion } from "@/components/ui/accordion";

const MODAL_EXAMPLE = `import { create } from "@sandbox-sdk/core";
import { modal } from "@sandbox-sdk/modal";

const sandbox = await create({
  adapter: modal({
    image: "alpine:3.21",
    ports: [3000],
  }),
  cwd: "/app",
  ports: [3000],
});`;

export const Modal = () => (
  <section>
    <Heading as="h3" id="adapter-modal">
      Modal
    </Heading>
    <p>
      Modal sandboxes via <code>modal</code>. The adapter creates sandboxes
      inside a Modal app, maps file reads and writes through Modal's sandbox
      filesystem, and exposes provider-declared ports through Modal tunnels.
      Reconnecting by sandbox id discovers existing tunnels automatically.
    </p>
    <p>
      Modal supports filesystem snapshot creation. In-place restore and
      background process handles stay unsupported in the normalized adapter
      until the provider exposes a matching stable primitive.
    </p>
    <CodeBlock code={MODAL_EXAMPLE} lang="ts" />
    <div className="flex flex-col gap-2">
      <Heading as="h4" id="adapter-modal-options">
        Options
      </Heading>
      <Accordion className="rounded-md border-dotted" type="multiple">
        <PropAccordionItem name="app" status="optional" value="app">
          <p>
            Modal app name used for new sandboxes. Defaults to{" "}
            <code>sandbox-sdk</code>.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="image" status="optional" value="image">
          <p>
            Modal image object, image id, or registry tag. The shared{" "}
            <code>template</code> and <code>snapshot</code> create options
            override this value.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="ports" status="optional" value="ports">
          <p>
            Encrypted ports declared at creation time and later exposed with{" "}
            <code>ports.expose()</code>. Reconnecting by sandbox id discovers
            existing tunnels without repeating this option.
          </p>
        </PropAccordionItem>
      </Accordion>
    </div>
  </section>
);
