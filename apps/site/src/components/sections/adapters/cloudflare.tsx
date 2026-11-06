import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";
import { PropAccordionItem } from "@/components/prop-accordion-item";
import { Accordion } from "@/components/ui/accordion";

const example = `import { DurableObject } from "cloudflare:workers";
import { cloudflare } from "@sandbox-sdk/cloudflare";
import { withSandbox } from "@sandbox-sdk/core";

type Env = Readonly<{ Sandbox: DurableObjectNamespace<Sandbox> }>;

export class Sandbox extends DurableObject<Env> {
  async run(): Promise<string> {
    const container = this.ctx.container;
    if (container === undefined) throw new Error("Configure the Sandbox container binding");
    return withSandbox({ adapter: cloudflare({ container, id: this.ctx.id.toString(), startup: { entrypoint: ["sleep", "infinity"], enableInternet: false } }) }, async (sandbox) => {
      await sandbox.files.write("message.txt", "hello cloudflare");
      return (await sandbox.process.exec("cat", ["message.txt"])).stdout;
    });
  }
}

export default {
  async fetch(_request: Request, env: Env): Promise<Response> {
    return new Response(await env.Sandbox.getByName("example").run());
  },
} satisfies ExportedHandler<Env>;`;

export const Cloudflare = () => (
  <section>
    <Heading as="h3" id="adapter-cloudflare">
      Cloudflare
    </Heading>
    <p>
      Cloudflare 1.0 runs through the native container inside your own Durable
      Object. Pass <code>this.ctx.container</code> to the adapter. Your Worker
      owns authorization, concurrency, routing, and lifetime.
    </p>
    <p>
      Configure a named <code>sandbox</code> image with the matching{" "}
      <code>sandbox-shim</code>. Networking stays disabled unless you enable it
      through <code>startup</code>. The adapter uses native argv execution and
      streams files through Cloudflare's <code>Files</code> helper.
    </p>
    <CodeBlock code={example} lang="ts" />
    <p>
      Container snapshots capture the root filesystem, excluding memory and
      mounted directories. Create a snapshot, restore the current container, or
      start a stopped container from its id. Snapshot deletion is not
      normalized. Container snapshots are a Cloudflare beta feature.
    </p>
    <p>
      Previews require an application-owned <code>preview</code> callback and a
      Worker route that forwards to{" "}
      <code>container.getTcpPort(port).fetch()</code>. Return private headers
      from the callback when access needs authentication.{" "}
      <code>preview.request()</code> keeps those headers out of serialized data.
    </p>
    <p>
      The old binding-based factory, sessions, interpreter contexts, and
      automatic tunnels are not native 1.0 APIs. <code>cloudflareBridge()</code>{" "}
      continues to support the separately deployed official 0.12 HTTP bridge
      with files, bounded commands, sessions, and quick or named tunnels. That
      bridge has no normalized background process handles or snapshots.
    </p>
    <div className="flex flex-col gap-2">
      <Heading as="h4" id="adapter-cloudflare-options">
        Options
      </Heading>
      <Accordion className="rounded-md border-dotted" type="multiple">
        <PropAccordionItem name="container" status="required" value="Container">
          <p>
            Pass the native container from your Durable Object. Keep its request
            context alive until processes and streams finish.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="image" status="optional" value="string">
          <p>
            Image containing the matching shim. Defaults to the configured{" "}
            <code>container.images.sandbox</code> image.
          </p>
        </PropAccordionItem>
        <PropAccordionItem
          name="startup"
          status="optional"
          value="ContainerStartupOptions"
        >
          <p>
            Native entrypoint, networking, and resource options used when
            starting or restoring a container.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="preview" status="optional" value="callback">
          <p>
            Return the public port URL and optional private access headers.
            Without this callback, the adapter advertises no preview support.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="cwd" status="optional" value="/workspace">
          <p>Default working directory for normalized files and commands.</p>
        </PropAccordionItem>
        <PropAccordionItem name="id" status="optional" value="string">
          <p>
            Application-owned identifier for bookkeeping. Pass{" "}
            <code>this.ctx.id.toString()</code> inside a Durable Object.
          </p>
        </PropAccordionItem>
      </Accordion>
    </div>
  </section>
);
