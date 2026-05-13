import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";

const USAGE_EXAMPLE = `import { create } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";

const sandbox = await create({
  adapter: local(),
});

await sandbox.files.write("main.ts", "console.log('hello')");
const result = await sandbox.process.exec("bun", ["main.ts"]);

console.log(result.stdout); // "hello\\n"

await sandbox.stop();`;

export const QuickStart = () => (
  <section>
    <Heading as="h2">Quick start</Heading>
    <p>
      Call <code>create</code> with an adapter to get a typed{" "}
      <code>Sandbox</code>. The adapter is fixed at construction; there is no
      runtime <code>{`{ provider, ... }`}</code> form, which keeps call sites
      flat and lets the <code>raw</code> property stay narrowly typed.
    </p>
    <CodeBlock code={USAGE_EXAMPLE} lang="tsx" />
  </section>
);
