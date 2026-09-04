import { aisdk, tools } from "@sandbox-sdk/ai";
import type { Kit } from "@sandbox-sdk/ai";
import { create as open, withSandbox } from "@sandbox-sdk/core";
import type { Sandbox } from "@sandbox-sdk/core";
import { vercel } from "@sandbox-sdk/vercel";
import { generateText, stepCountIs, streamText, ToolLoopAgent } from "ai";
import type { LanguageModel } from "ai";

export const model = "openai/gpt-5.4-nano" satisfies LanguageModel;

const options = {
  adapter: vercel({ runtime: "node24" }),
  cwd: "/vercel/sandbox",
  timeout: 300_000,
};

const context = (sandbox: Sandbox): Kit =>
  tools(sandbox, {
    allow: ["read", "write", "list"],
    cwd: options.cwd,
  });

const create = <Result>(
  run: (kit: Kit) => Promise<Result> | Result
): Promise<Result> => withSandbox(options, (sandbox) => run(context(sandbox)));

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

export const stream = async function* stream(
  selected: LanguageModel = model
): AsyncGenerator<string> {
  const sandbox = await open(options);
  const controller = new AbortController();
  try {
    const result = streamText({
      abortSignal: controller.signal,
      model: selected,
      ...aisdk(context(sandbox)),
      prompt: "write a hello.txt file in the sandbox and read it back",
      stopWhen: stepCountIs(5),
    });

    yield* result.textStream;
  } finally {
    controller.abort();
    await sandbox.stop();
  }
};

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
