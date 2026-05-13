import { withSandbox } from "@sandbox-sdk/core";
import { modal } from "@sandbox-sdk/modal";

export const run = (): Promise<string> =>
  withSandbox(
    {
      adapter: modal({
        image: "alpine:3.21",
      }),
      cwd: "/app",
      timeout: 300_000,
    },
    async (sandbox) => {
      await sandbox.files.write("/app/message.txt", "hello from modal");

      const result = await sandbox.process.exec("cat", ["/app/message.txt"]);
      return result.stdout;
    }
  );
