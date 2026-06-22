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
import { aisdk, tools } from "@sandbox-sdk/ai";

const sandbox = await create({ adapter: local() });
const kit = tools(sandbox, {
  allow: ["read", "write", "list", "exec"],
});
const ai = aisdk(kit);

await kit.tools.write?.execute({
  path: "main.ts",
  text: "console.log('hi')",
});

await kit.tools.exec?.execute({ command: "bun main.ts" });`;

const AI_SDK_EXAMPLE = `import { generateText } from "ai";
import { create } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";
import { aisdk, tools } from "@sandbox-sdk/ai";

const sandbox = await create({ adapter: local() });
const kit = aisdk(tools(sandbox, {
  allow: ["read", "write", "list", "exec"],
}));

const result = await generateText({
  model: "openai/gpt-5.4-nano",
  ...kit,
  prompt: "Write a TypeScript program that prints fib(10), then run it.",
});`;

const OPENAI_EXAMPLE = `import { Agent, run } from "@openai/agents";
import { create } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";
import { tools } from "@sandbox-sdk/ai";
import { openai } from "@sandbox-sdk/ai/openai";

const sandbox = await create({ adapter: local() });
const kit = openai(tools(sandbox, {
  allow: ["read", "write", "list", "exec"],
}));

const agent = new Agent({
  name: "sandbox agent",
  instructions: kit.instructions,
  tools: Object.values(kit.tools),
});

const result = await run(agent, "Create a package.json and run bun test.");`;

const CLAUDE_EXAMPLE = `import { query } from "@anthropic-ai/claude-agent-sdk";
import { create } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";
import { tools } from "@sandbox-sdk/ai";
import { claude } from "@sandbox-sdk/ai/claude";

const sandbox = await create({ adapter: local() });
const kit = claude(tools(sandbox, {
  allow: ["read", "write", "list", "exec"],
}));

for await (const message of query({
  prompt: "Set up a Bun project, install zod, and write a parser.",
  options: {
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: kit.instructions,
    },
    mcpServers: kit.mcpServers,
    allowedTools: kit.allowedTools,
    canUseTool: kit.canUseTool,
    tools: [],
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
    <p>
      Requested operations the adapter cannot perform are omitted from the
      model-facing tool set. The AI SDK session only starts background commands
      when the provider exposes separate stdout and stderr streams, so it never
      presents combined output as standard output.
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
        <code>execute</code> function. Use <code>aisdk()</code>,{" "}
        <code>openai()</code>, or <code>claude()</code> when you want the exact
        adapter shape for a framework.
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
        The root package has no hard dependency on <code>ai</code>.{" "}
        <code>aisdk()</code> returns the shape used by{" "}
        <a
          className="underline decoration-dotted underline-offset-4 hover:text-foreground"
          href="https://ai-sdk.dev"
          rel="noreferrer"
          target="_blank"
        >
          Vercel AI SDK
        </a>
        : <code>system</code>, <code>tools</code>, and{" "}
        <code>experimental_sandbox</code>. The same tool definitions work with
        v6 and v7 style calls, including <code>generateText</code>,{" "}
        <code>streamText</code>, and agent loops that forward the sandbox to
        tool execution. With AI Gateway, pass a <code>provider/model</code>{" "}
        string directly as <code>model</code>.
      </p>
      <p>
        Use <code>network(sandbox)</code> when trusted host code also needs
        lifecycle, ports, or <code>raw</code> provider controls. The returned
        session is AI SDK-compatible, while <code>restricted()</code> returns a
        separate session without the host-owned <code>backend</code>.
      </p>
      <CodeBlock code={AI_SDK_EXAMPLE} lang="tsx" />
    </section>

    <section>
      <Heading as="h3" id="openai-tools">
        OpenAI Agents SDK
      </Heading>
      <p>
        Install <code>@openai/agents</code> and import{" "}
        <code>@sandbox-sdk/ai/openai</code>. The adapter uses the real OpenAI{" "}
        <code>tool()</code> helper, emits JSON-schema parameters, names tools
        with a <code>sandbox_</code> prefix by default, and requires approval
        for side-effect tools unless you opt into autonomous execution.
      </p>
      <CodeBlock code={OPENAI_EXAMPLE} lang="tsx" />
    </section>

    <section>
      <Heading as="h3" id="claude-tools">
        Claude Agent SDK
      </Heading>
      <p>
        Install <code>@anthropic-ai/claude-agent-sdk</code> and import{" "}
        <code>@sandbox-sdk/ai/claude</code>. Claude custom tools run through an
        in-process MCP server, so the adapter returns <code>mcpServers</code>,{" "}
        <code>allowedTools</code>, <code>canUseTool</code>, and prompt context
        for <code>systemPrompt</code>. Read-only tools are annotated as safe,
        while <code>write</code>, <code>exec</code>, and <code>preview</code>{" "}
        require approval by default.
      </p>
      <p>
        Use <code>{`{ requireApproval: false }`}</code> only for disposable
        sandboxes where the agent should run without a human approval loop.
      </p>
      <CodeBlock code={CLAUDE_EXAMPLE} lang="tsx" />
    </section>

    <section>
      <Heading as="h3" id="ai-tool-safety">
        Safety model
      </Heading>
      <p>
        <code>read</code> and <code>list</code> are safe by default.{" "}
        <code>write</code>, <code>exec</code>, and <code>preview</code> are
        side-effect tools and must be enabled explicitly. OpenAI and Claude
        adapters expose approval controls at the framework layer, and every tool
        still runs through the policy hooks configured in <code>tools()</code>.
      </p>
    </section>
  </section>
);
