import type { Sandbox as CloudflareSandbox } from "@cloudflare/sandbox";
import { cloudflare } from "@sandbox-sdk/cloudflare";
import { create } from "@sandbox-sdk/core";

export { Sandbox } from "@cloudflare/sandbox";

type Env = Readonly<{
  Sandbox: DurableObjectNamespace<CloudflareSandbox>;
}>;

export default {
  async fetch(request, env): Promise<Response> {
    const { hostname } = new URL(request.url);
    const sandbox = await create({
      adapter: cloudflare({
        binding: env.Sandbox,
        hostname,
      }),
      cwd: "/workspace",
    });

    try {
      await sandbox.files.write("/workspace/message.txt", "hello cloudflare");
      const result = await sandbox.process.exec("cat", [
        "/workspace/message.txt",
      ]);
      return Response.json({ stdout: result.stdout });
    } finally {
      await sandbox.stop();
    }
  },
} satisfies ExportedHandler<Env>;
