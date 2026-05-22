import { aisdk, tools } from "@sandbox-sdk/ai";
import type { AisdkOptions } from "@sandbox-sdk/ai";
import { withSandbox } from "@sandbox-sdk/core";
import { vercel } from "@sandbox-sdk/vercel";

type GenerateText = (
  input: AisdkOptions & {
    model: unknown;
    prompt: string;
  }
) => Promise<{
  text: string;
}>;

export const run = (
  generateText: GenerateText,
  model: unknown
): Promise<string> =>
  withSandbox(
    {
      adapter: vercel({
        ports: [3000],
        runtime: "node24",
      }),
      cwd: "/vercel/sandbox",
      ports: [3000],
      timeout: 300_000,
    },
    async (sandbox) => {
      const kit = tools(sandbox, {
        allow: ["read", "write", "list", "exec", "preview"],
        cwd: "/vercel/sandbox",
      });

      const result = await generateText({
        model,
        ...aisdk(kit),
        prompt: "write a hello.txt file in the sandbox and read it back",
      });

      return result.text;
    }
  );
