import { withSandbox } from "@sandbox-sdk/core";
import { e2b } from "@sandbox-sdk/e2b";

export const run = (): Promise<string> =>
  withSandbox(
    {
      adapter: e2b(),
      cwd: "/home/user",
      timeout: 300_000,
    },
    async (sandbox) => {
      await sandbox.files.write("/home/user/message.txt", "hello from e2b");

      const result = await sandbox.process.exec("cat", [
        "/home/user/message.txt",
      ]);
      return result.stdout;
    }
  );
