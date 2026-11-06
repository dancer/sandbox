import { cloudflare } from "@sandbox-sdk/cloudflare";
import { withSandbox } from "@sandbox-sdk/core";
import { DurableObject } from "cloudflare:workers";

type Env = Readonly<{ Sandbox: DurableObjectNamespace<Sandbox> }>;

export class Sandbox extends DurableObject<Env> {
  run(): Promise<string> {
    const { container } = this.ctx;
    if (container === undefined) {
      throw new Error("Configure the Sandbox container binding");
    }
    return withSandbox(
      {
        adapter: cloudflare({
          container,
          id: this.ctx.id.toString(),
          startup: { enableInternet: false, entrypoint: ["sleep", "infinity"] },
        }),
      },
      async (sandbox) => {
        await sandbox.files.write("message.txt", "hello cloudflare");
        const output = await sandbox.process.exec("cat", ["message.txt"]);
        return output.stdout;
      }
    );
  }
}

export default {
  async fetch(_request: Request, env: Env): Promise<Response> {
    return new Response(await env.Sandbox.getByName("example").run());
  },
} satisfies ExportedHandler<Env>;
