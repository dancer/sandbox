import { codesandbox } from "@sandbox-sdk/codesandbox";
import { withSandbox } from "@sandbox-sdk/core";

export const run = (): Promise<string> =>
  withSandbox(
    {
      adapter: codesandbox(),
      cwd: "/project/sandbox",
      timeout: 300_000,
    },
    async (sandbox) => {
      await sandbox.files.write(
        "/project/sandbox/message.txt",
        "hello from codesandbox"
      );

      const result = await sandbox.process.exec("cat", [
        "/project/sandbox/message.txt",
      ]);
      return result.stdout;
    }
  );
