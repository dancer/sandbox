import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";

const SANDBOX_TYPE = `type Sandbox<Raw = unknown> = Readonly<{
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
}>;

type Capability =
  | "environment"
  | "files"
  | "process"
  | "ports"
  | "snapshots"
  | "streaming";

type RawCapability =
  | "backup"
  | "buckets"
  | "codegen"
  | "desktop"
  | "drives"
  | "git"
  | "gpu"
  | "interpreter"
  | "lifecycle"
  | "mcp"
  | "network"
  | "previews"
  | "pty"
  | "secrets"
  | "sessions"
  | "system"
  | "tunnels"
  | "volumes"
  | "watching";

type Mode =
  | boolean
  | "combined"
  | "create-time"
  | "derived"
  | "disk"
  | "dynamic"
  | "filesystem"
  | "memory"
  | "separate"
  | "volume";

type Capabilities = Readonly<
  Partial<Record<Capability, Mode>> & {
    raw?: Partial<Record<RawCapability, Mode>>;
  }
>;`;

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
      autocomplete-friendly without losing the unified shape.
    </p>
  </section>
);
