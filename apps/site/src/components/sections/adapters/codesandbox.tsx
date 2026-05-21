import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";
import { PropAccordionItem } from "@/components/prop-accordion-item";
import { Accordion } from "@/components/ui/accordion";

const CODESANDBOX_EXAMPLE = `import { create } from "@sandbox-sdk/core";
import { codesandbox } from "@sandbox-sdk/codesandbox";

const sandbox = await create({
  adapter: codesandbox({
    template: "template-sandbox-id",
  }),
  cwd: "/project/sandbox",
});`;

export const CodeSandbox = () => (
  <section>
    <Heading as="h3" id="adapter-codesandbox">
      CodeSandbox
    </Heading>
    <p>
      CodeSandbox microVMs via <code>@codesandbox/sdk</code>. The adapter
      creates or resumes sandboxes, connects a session, and normalizes files,
      commands, background commands, and opened ports.
    </p>
    <p>
      Use <code>template</code> to fork from a template sandbox, or{" "}
      <code>snapshot</code> to fork from a snapshot created with{" "}
      <code>snapshots.create()</code>. Use <code>id</code> on{" "}
      <code>create()</code> to resume an existing sandbox.
    </p>
    <CodeBlock code={CODESANDBOX_EXAMPLE} lang="ts" />
    <div className="flex flex-col gap-2">
      <Heading as="h4" id="adapter-codesandbox-options">
        Options
      </Heading>
      <Accordion className="rounded-md border-dotted" type="multiple">
        <PropAccordionItem name="token" status="optional" value="token">
          <p>
            CodeSandbox API token. Omit it to use <code>CSB_API_KEY</code>.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="template" status="optional" value="template">
          <p>
            Template sandbox id used when creating a new sandbox. The shared{" "}
            <code>template</code> create option overrides this value.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="stop" status="optional" value="stop">
          <p>
            Cleanup behavior for <code>sandbox.stop()</code>. Defaults to{" "}
            <code>shutdown</code>; use <code>hibernate</code>,{" "}
            <code>disconnect</code>, or <code>delete</code> when needed.
          </p>
        </PropAccordionItem>
      </Accordion>
    </div>
  </section>
);
