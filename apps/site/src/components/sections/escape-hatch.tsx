import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";

const RAW_EXAMPLE = `// typed per adapter. the local adapter exposes { root }, E2B exposes
// the sandbox client, cloudflare exposes the durable object stub, etc
const { root } = sandbox.raw;
await inspectWorkspace(root);

// cloud example: drop down to E2B's native filesystem watcher
sandbox.raw.files.watchDir("src", (event) => {
  console.log(event);
});`;

export const EscapeHatch = () => (
  <section>
    <Heading as="h2" number={8}>
      Escape hatch
    </Heading>
    <p>
      When you need a feature outside the unified surface, like
      provider-specific networking, GPU attach, custom snapshots, or container
      internals, drop down to the native client. The <code>raw</code> property
      is typed per adapter so you keep autocomplete, while the rest of your
      agent loop stays portable.
    </p>
    <CodeBlock code={RAW_EXAMPLE} lang="ts" />
  </section>
);
