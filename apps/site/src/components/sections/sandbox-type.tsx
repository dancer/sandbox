import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";

const SANDBOX_TYPE = `type Sandbox<Raw = unknown> = Readonly<{
  id: string;
  provider: string;
  capabilities: Capabilities;
  files: Files;
  process: Process;
  ports: Ports;
  snapshots: Snapshots;
  raw: Raw;
  stop(): Promise<void>;
}>;

type Capability =
  | "files"
  | "process"
  | "ports"
  | "snapshots"
  | "secrets"
  | "environment"
  | "streaming";

type Capabilities = Readonly<Partial<Record<Capability, boolean>>>;`;

export const SandboxType = () => (
  <section>
    <Heading as="h2">The Sandbox type</Heading>
    <p>
      <code>Sandbox</code> is a frozen record of the five capability namespaces
      (<code>files</code>, <code>process</code>, <code>ports</code>,{" "}
      <code>snapshots</code>, <code>raw</code>) plus identifiers and a lifecycle
      hook. <code>capabilities</code> declares what the underlying provider can
      do. Branch on it instead of catching unsupported errors.
    </p>
    <CodeBlock code={SANDBOX_TYPE} lang="ts" />
    <p>
      The <code>Raw</code> type parameter is set per-adapter (the local adapter
      sets it to <code>{`{ root: string }`}</code>; cloud adapters set it to
      their native client) so <code>sandbox.raw</code> stays
      autocomplete-friendly without losing the unified shape.
    </p>
  </section>
);
