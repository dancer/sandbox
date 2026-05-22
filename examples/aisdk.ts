import { aisdk, tools } from "@sandbox-sdk/ai";
import type { Kit } from "@sandbox-sdk/ai";
import { withSandbox } from "@sandbox-sdk/core";
import { vercel } from "@sandbox-sdk/vercel";
import { generateText, stepCountIs, streamText, ToolLoopAgent } from "ai";
import type { LanguageModel } from "ai";

export const model = "openai/gpt-5.4-nano" satisfies LanguageModel;

const create = <Result>(
  run: (kit: Kit) => Promise<Result> | Result
): Promise<Result> =>
  withSandbox(
    {
      adapter: vercel({
        runtime: "node24",
      }),
      cwd: "/vercel/sandbox",
      timeout: 300_000,
    },
    (sandbox) => {
      const kit = tools(sandbox, {
        allow: ["read", "write", "list", "exec", "preview"],
        cwd: "/vercel/sandbox",
      });

      return run(kit);
    }
  );

export const generate = (selected: LanguageModel = model): Promise<string> =>
  create(async (kit) => {
    const result = await generateText({
      model: selected,
      ...aisdk(kit),
      prompt: "write a hello.txt file in the sandbox and read it back",
      stopWhen: stepCountIs(5),
    });

    return result.text;
  });

export const stream = (selected: LanguageModel = model) =>
  create((kit) => {
    const result = streamText({
      model: selected,
      ...aisdk(kit),
      prompt: "write a hello.txt file in the sandbox and read it back",
      stopWhen: stepCountIs(5),
    });

    return result.textStream;
  });

export const agent = (selected: LanguageModel = model): Promise<string> =>
  create(async (kit) => {
    const runner = new ToolLoopAgent({
      model: selected,
      ...aisdk(kit),
      stopWhen: stepCountIs(5),
    });

    const result = await runner.generate({
      prompt: "write a hello.txt file in the sandbox and read it back",
    });

    return result.text;
  });
