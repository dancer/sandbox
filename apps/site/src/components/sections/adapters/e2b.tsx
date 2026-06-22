import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";
import { PropAccordionItem } from "@/components/prop-accordion-item";
import { Accordion } from "@/components/ui/accordion";

const E2B_EXAMPLE = `import { create } from "@sandbox-sdk/core";
import { e2b } from "@sandbox-sdk/e2b";

const sandbox = await create({
  adapter: e2b({
    template: "base",
  }),
});`;

export const E2B = () => (
  <section>
    <Heading as="h3" id="adapter-e2b">
      E2B
    </Heading>
    <p>
      E2B's microVM sandboxes via <code>e2b</code>. The adapter can pin a
      template at construction and threads writes, commands, ports, and
      snapshots through the E2B SDK.
    </p>
    <p>
      Use the shared <code>snapshot</code> create option to start a fresh E2B
      sandbox from a snapshot id. E2B snapshots capture filesystem and memory
      state, briefly pausing the source sandbox and dropping active command,
      PTY, and WebSocket connections. Use <code>template</code> for provider
      template ids and names. Named snapshots return E2B's persisted canonical
      name, which can include a namespace and tag. Call{" "}
      <code>snapshots.delete()</code> after the snapshot is no longer needed.
    </p>
    <p>
      When E2B restricts preview traffic, call <code>preview.request()</code>{" "}
      after <code>ports.expose()</code>. It retains the traffic access header
      without returning it in serializable data.
    </p>
    <CodeBlock code={E2B_EXAMPLE} lang="ts" />
    <div className="flex flex-col gap-2">
      <Heading as="h4" id="adapter-e2b-options">
        Options
      </Heading>
      <Accordion className="rounded-md border-dotted" type="multiple">
        <PropAccordionItem name="template" status="optional" value="template">
          <p>
            E2B sandbox template id or name. Pre-baked templates ship with
            common stacks (Node, Python, Bun) and you can build your own via the
            E2B CLI.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="apiKey" status="optional" value="apiKey">
          <p>
            E2B API key passed to the native SDK. Omit it to use the provider
            SDK's environment-based defaults.
          </p>
        </PropAccordionItem>
        <PropAccordionItem
          name="apiHeaders"
          status="optional"
          value="apiHeaders"
        >
          <p>
            Additional E2B control-plane headers for custom authentication or
            gateway deployments. They are never copied into the sandbox.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="proxy" status="optional" value="proxy">
          <p>
            HTTP proxy for E2B control-plane and sandbox traffic. Use this when
            your runtime requires an outbound proxy.
          </p>
        </PropAccordionItem>
        <PropAccordionItem name="timeout" status="optional" value="timeout">
          <p>
            Maximum lifetime of the sandbox in milliseconds. After it elapses
            E2B kills the sandbox server-side. Defaults to E2B's account
            default.
          </p>
        </PropAccordionItem>
      </Accordion>
    </div>
  </section>
);
