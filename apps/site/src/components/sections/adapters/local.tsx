import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";
import { PropAccordionItem } from "@/components/prop-accordion-item";
import { Accordion } from "@/components/ui/accordion";

const LOCAL_EXAMPLE = `import { create } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";

// the dev/test adapter points at a directory and implements
// the same Sandbox contract as the cloud adapters using
// node:child_process and node:fs/promises
const sandbox = await create({
  adapter: local({
    // optional: pin to a directory, otherwise mkdtemp picks one
    // under the os temp dir and stop() cleans it up
    // root: "./.sandbox",
    // keep: true,
  }),
});`;

export const Local = () => (
  <section>
    <Heading as="h3" id="adapter-local">
      Local
    </Heading>
    <p>
      Local filesystem and child process. The dev/test adapter: point it at a
      directory and it implements the same <code>Sandbox</code> contract as the
      cloud adapters using <code>node:fs/promises</code> and{" "}
      <code>node:child_process</code>. Every path is resolved against the
      sandbox root and rejected if it escapes. Ports and snapshots throw.
    </p>
    <CodeBlock code={LOCAL_EXAMPLE} lang="ts" />
    <div className="flex flex-col gap-2">
      <Heading as="h4" id="adapter-local-options">
        Options
      </Heading>
      <Accordion className="rounded-md border-dotted" type="multiple">
        <PropAccordionItem name="root" status="optional" value="root">
          <p>
            Directory the adapter manages. Absolute or relative; created on
            <code>create()</code>. All file operations are scoped to it; paths
            that resolve outside (e.g. <code>../etc/passwd</code>) throw{" "}
            <code>SandboxError</code> with <code>code: "path_escape"</code>.
            When omitted, the adapter creates a fresh <code>mkdtemp</code>{" "}
            directory under the OS temp dir and <code>stop()</code> deletes it.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="keep" status="optional" value="keep">
          <p>
            When <code>true</code>, <code>stop()</code> leaves the root
            directory in place. Only consulted when <code>root</code> is unset.
            Pinned roots are never deleted. Useful for inspecting output after a
            failed test run.
          </p>
        </PropAccordionItem>
      </Accordion>
    </div>
  </section>
);
