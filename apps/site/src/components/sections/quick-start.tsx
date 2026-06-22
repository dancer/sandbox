import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";

const USAGE_EXAMPLE = `import { withSandbox } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";

await withSandbox(
  {
    adapter: local(),
    cwd: "/workspace",
  },
  async (sandbox) => {
    await sandbox.files.write("main.ts", "console.log('hello')");

    const result = await sandbox.process.shell("bun main.ts");

    console.log(result.stdout);
  }
);`;

export const QuickStart = () => (
  <section>
    <Heading as="h2" number={3}>
      Quick start
    </Heading>
    <p>
      Call <code>withSandbox</code> with an adapter to get a typed{" "}
      <code>Sandbox</code> that is stopped automatically after success or
      failure. The adapter is fixed at construction; there is no runtime{" "}
      <code>{`{ provider, ... }`}</code> form, which keeps call sites flat and
      lets the <code>raw</code> property stay narrowly typed.
    </p>
    <CodeBlock code={USAGE_EXAMPLE} lang="tsx" />
  </section>
);
