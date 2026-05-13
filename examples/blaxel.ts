import { blaxel } from "@sandbox-sdk/blaxel";
import { withSandbox } from "@sandbox-sdk/core";

export const run = (): Promise<string> =>
  withSandbox(
    {
      adapter: blaxel({
        image: "blaxel/base-image:latest",
      }),
      cwd: "/app",
      timeout: 300_000,
    },
    async (sandbox) => {
      await sandbox.files.write("/app/message.txt", "hello from blaxel");

      const result = await sandbox.process.exec("cat", ["/app/message.txt"]);
      return result.stdout;
    }
  );
