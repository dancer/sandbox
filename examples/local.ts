import { withSandbox } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";

export const run = (): Promise<string> =>
  withSandbox(
    {
      adapter: local(),
      cwd: "/workspace",
    },
    async (sandbox) => {
      await sandbox.files.write("message.txt", "hello from local");

      const result = await sandbox.process.exec("cat", ["message.txt"]);
      return result.stdout;
    }
  );
