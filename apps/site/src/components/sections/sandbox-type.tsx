import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";

const SANDBOX_TYPE = `import type {
  Capabilities,
  Files,
  Ports,
  Process,
  Snapshots,
} from "@sandbox-sdk/core";

type Sandbox<Raw = unknown> = Readonly<{
  id: string;
  provider: string;
  cwd: string;
  capabilities: Capabilities;
  files: Files;
  process: Process;
  ports: Ports;
  snapshots: Snapshots;
  raw: Raw;
  stop(): Promise<void>;
}>;`;

export const SandboxType = () => (
  <section>
    <Heading as="h2" number={6}>
      The Sandbox type
    </Heading>
    <p>
      <code>Sandbox</code> is a frozen record of the five capability namespaces
      (<code>files</code>, <code>process</code>, <code>ports</code>,{" "}
      <code>snapshots</code>, <code>raw</code>) plus identifiers and a lifecycle
      hook. <code>capabilities</code> declares what the underlying provider can
      do through the normalized API. Provider-specific powers live under{" "}
      <code>capabilities.raw</code> and are available through{" "}
      <code>sandbox.raw</code>.
    </p>
    <CodeBlock code={SANDBOX_TYPE} lang="ts" />
    <p>
      The <code>Raw</code> type parameter is set per-adapter (the local adapter
      sets it to <code>{`{ root: string }`}</code>; cloud adapters set it to
      their native client) so <code>sandbox.raw</code> stays
      autocomplete-friendly without losing the unified shape. Import the
      capability types instead of copying their unions: the generated API
      reference stays the source of truth as the contract evolves.
    </p>
  </section>
);
