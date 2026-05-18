import { Heading } from "@/components/heading";

export const Why = () => (
  <section>
    <Heading as="h2" number={1}>
      Why
    </Heading>
    <p>
      Every sandbox provider exposes a slightly different API for the same
      handful of primitives. <code>@sandbox-sdk/core</code> exposes the slice
      that's the same everywhere (files, processes, ports, snapshots) behind one
      small contract, and gets out of the way for anything provider-specific.
    </p>
    <ul>
      <li>
        <span className="text-foreground">One small API across providers.</span>{" "}
        Swap E2B for Daytona without rewriting your agent loop.
      </li>
      <li>
        <span className="text-foreground">Web-standards I/O.</span> Accepts{" "}
        <code>string</code>, <code>Uint8Array</code>, <code>Blob</code>,{" "}
        <code>ArrayBuffer</code>, or a <code>ReadableStream</code>. Runs on
        Node, Bun, Workers. Anywhere the fetch primitives run.
      </li>
      <li>
        <span className="text-foreground">Capabilities, not surprises.</span>{" "}
        Each adapter declares what it supports. Branch on{" "}
        <code>supports(sandbox, "snapshotCreate")</code> and{" "}
        <code>supports(sandbox, "snapshotRestore")</code> instead of discovering
        it the hard way in production.
      </li>
      <li>
        <span className="text-foreground">
          Escape hatch via <code>sandbox.raw</code>.
        </span>{" "}
        The native client is always one property away, typed per adapter, for
        anything outside the unified surface.
      </li>
      <li>
        <span className="text-foreground">Predictable errors.</span> A single{" "}
        <code>SandboxError</code> with a normalized <code>code</code> across
        providers, and the original error attached as <code>cause</code>.
      </li>
    </ul>
  </section>
);
