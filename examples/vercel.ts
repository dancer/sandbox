import { withSandbox } from "@sandbox-sdk/core";
import { vercel } from "@sandbox-sdk/vercel";

export const run = (): Promise<string> =>
  withSandbox(
    {
      adapter: vercel({
        runtime: "node24",
      }),
      cwd: "/vercel/sandbox",
      timeout: 300_000,
    },
    async (sandbox) => {
      await sandbox.files.write(
        "/vercel/sandbox/message.txt",
        "hello from vercel"
      );

      const result = await sandbox.process.exec("cat", [
        "/vercel/sandbox/message.txt",
      ]);
      return result.stdout;
    }
  );
