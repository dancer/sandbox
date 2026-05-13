import { withSandbox } from "@sandbox-sdk/core";
import { daytona } from "@sandbox-sdk/daytona";

export const run = (): Promise<string> =>
  withSandbox(
    {
      adapter: daytona({
        deleteOnStop: true,
      }),
      cwd: "/tmp/sandbox-sdk",
      timeout: 300_000,
    },
    async (sandbox) => {
      await sandbox.files.write(
        "/tmp/sandbox-sdk/message.txt",
        "hello from daytona"
      );

      const result = await sandbox.process.exec("cat", [
        "/tmp/sandbox-sdk/message.txt",
      ]);
      return result.stdout;
    }
  );
