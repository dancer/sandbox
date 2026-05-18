import { CodeBlock } from "@/components/code-block";
import { CodeTabs } from "@/components/code-tabs";
import { Heading } from "@/components/heading";
import { PropAccordionItem } from "@/components/prop-accordion-item";
import { Accordion } from "@/components/ui/accordion";

const INSTALL_TABS = [
  {
    code: "bun add @sandbox-sdk/ai",
    id: "bun",
    label: "bun",
    lang: "bash",
  },
  {
    code: "pnpm add @sandbox-sdk/ai",
    id: "pnpm",
    label: "pnpm",
    lang: "bash",
  },
  {
    code: "npm install @sandbox-sdk/ai",
    id: "npm",
    label: "npm",
    lang: "bash",
  },
  {
    code: "yarn add @sandbox-sdk/ai",
    id: "yarn",
    label: "yarn",
    lang: "bash",
  },
] as const;

const QUICK_START = `import { create } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";
import { tools } from "@sandbox-sdk/ai";

const sandbox = await create({ adapter: local() });
const kit = tools(sandbox);

await kit.tools.write?.execute({
  path: "/workspace/main.ts",
  text: "console.log('hi')",
});

await kit.tools.exec?.execute({ command: "bun /workspace/main.ts" });`;

const AI_SDK_EXAMPLE = `import { generateText } from "ai";
import { create } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";
import { tools } from "@sandbox-sdk/ai";

const sandbox = await create({ adapter: local() });
const kit = tools(sandbox);

const result = await generateText({
  model: yourModel,
  experimental_sandbox: kit.sandbox,
  system: kit.description,
  tools: kit.tools,
  prompt: "Write a TypeScript program that prints fib(10), then run it.",
});`;

const CLAUDE_EXAMPLE = `import { query } from "@anthropic-ai/claude-agent-sdk";
import { create } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";
import { tools } from "@sandbox-sdk/ai";

const sandbox = await create({ adapter: local() });
const kit = tools(sandbox);

for await (const message of query({
  prompt: "Set up a Bun project, install zod, and write a parser.",
  options: {
    customSystemPrompt: kit.description,
    tools: [kit.tools.read, kit.tools.write, kit.tools.exec],
  },
})) {
  handle(message);
}`;

export const AiTools = () => (
  <section>
    <Heading as="h2" id="ai-tools" number={9}>
      AI tools
    </Heading>
    <p>
      <code>@sandbox-sdk/ai</code> wraps a configured sandbox into ready-made
      tools for agent frameworks. The kit includes prompt context plus file,
      command, directory, preview tools, and an AI SDK-compatible sandbox object
      with JSON-schema inputs. Pick the framework that matches your stack; each
      tool is just a thin shim around <code>files</code>, <code>process</code>,
      and <code>ports</code> on the underlying sandbox.
    </p>

    <section>
      <Heading as="h3" id="ai-tools-installation">
        Installation
      </Heading>
      <CodeTabs tabs={INSTALL_TABS} />
    </section>

    <section>
      <Heading as="h3" id="ai-tools-quick-start">
        Quick start
      </Heading>
      <p>
        Pass a configured sandbox into <code>tools()</code>. The return value is
        prompt context and a record of tool definitions, each with a{" "}
        <code>description</code>, <code>inputSchema</code>, and{" "}
        <code>execute</code> function. The <code>sandbox</code> property matches
        AI SDK's <code>{`{ description, executeCommand }`}</code> shape.
      </p>
      <CodeBlock code={QUICK_START} lang="tsx" />
      <Accordion className="rounded-md border-dotted" type="multiple">
        <PropAccordionItem name="read" value="ai-read">
          <p>
            Reads a UTF-8 text file at <code>{`{ path }`}</code> through{" "}
            <code>sandbox.files.text()</code>. Returns <code>{`{ text }`}</code>
            .
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="write" value="ai-write">
          <p>
            Writes <code>{`{ path, text }`}</code> to the sandbox via{" "}
            <code>sandbox.files.write()</code>. Returns{" "}
            <code>{`{ ok: true }`}</code> on success.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="exec" value="ai-exec">
          <p>
            Runs <code>{`{ command, args?, cwd? }`}</code> through{" "}
            <code>sandbox.process.shell()</code> when <code>args</code> is
            omitted, or <code>sandbox.process.exec()</code> when args are
            provided. Returns the buffered{" "}
            <code>{`{ code, stdout, stderr }`}</code> result.
          </p>
        </PropAccordionItem>
      </Accordion>
    </section>

    <section>
      <Heading as="h3" id="ai-sdk-tools">
        Vercel AI SDK
      </Heading>
      <p>
        The shape returned by <code>tools()</code> plugs straight into the{" "}
        <a
          className="underline decoration-dotted underline-offset-4 hover:text-foreground"
          href="https://ai-sdk.dev"
          rel="noreferrer"
          target="_blank"
        >
          Vercel AI SDK
        </a>
        's <code>tools</code> and <code>experimental_sandbox</code> fields. The
        model can read files, write files, and run commands inside the sandbox
        without you wiring up shell access in your app.
      </p>
      <CodeBlock code={AI_SDK_EXAMPLE} lang="tsx" />
    </section>

    <section>
      <Heading as="h3" id="claude-tools">
        Claude Agent SDK
      </Heading>
      <p>
        Hand the same tool definitions to the{" "}
        <a
          className="underline decoration-dotted underline-offset-4 hover:text-foreground"
          href="https://docs.claude.com/en/api/agent-sdk/overview"
          rel="noreferrer"
          target="_blank"
        >
          Claude Agent SDK
        </a>{" "}
        and the model can drive a real isolated runtime, handy for codegen
        agents that need to install packages, run tests, and inspect output
        without touching the host.
      </p>
      <CodeBlock code={CLAUDE_EXAMPLE} lang="tsx" />
    </section>

    <section>
      <Heading as="h3" id="openai-tools">
        OpenAI
      </Heading>
      <p>
        OpenAI's Responses and Agents SDKs accept tool definitions keyed by{" "}
        <code>name</code> with a JSON-schema <code>parameters</code> block. The
        current kit exposes the same underlying JSON Schema on{" "}
        <code>inputSchema.jsonSchema</code>, so map it deliberately before
        sending tools to OpenAI. A dedicated OpenAI subpath is on the roadmap
        once the Responses approval flow stabilizes.
      </p>
    </section>
  </section>
);
