import { gateway } from "@ai-sdk/gateway";
import { aisdk, tools } from "@sandbox-sdk/ai";
import { withSandbox } from "@sandbox-sdk/core";
import { vercel } from "@sandbox-sdk/vercel";
import { generateText, stepCountIs } from "ai";

const model = "openai/gpt-5.4-nano";

const text = await withSandbox(
  {
    adapter: vercel({
      runtime: "node24",
    }),
    cwd: "/vercel/sandbox",
    timeout: 300_000,
  },
  async (sandbox) => {
    const kit = tools(sandbox, {
      allow: ["read", "write", "list", "exec", "preview"],
      cwd: "/vercel/sandbox",
    });

    const result = await generateText({
      model: gateway(model),
      ...aisdk(kit),
      prompt:
        "write hello from gateway to /vercel/sandbox/hello.txt, read it back, and reply with the file contents only",
      stopWhen: stepCountIs(5),
    });

    return result.text;
  }
);

if (import.meta.main) {
  await Bun.stdout.write(`${text}\n`);
}
