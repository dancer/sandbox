import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";

const ERROR_EXAMPLE = `import { SandboxError } from "@sandbox-sdk/core";

try {
  await sandbox.ports.expose(3000);
} catch (err) {
  if (err instanceof SandboxError && err.code === "unsupported") {
    return new Response("preview unavailable");
  }
  throw err;
}`;

export const Errors = () => (
  <section>
    <Heading as="h2" number={7}>
      Errors
    </Heading>
    <p>
      Every method throws a single <code>SandboxError</code> with a normalized{" "}
      <code>code</code> and the provider name on <code>provider</code>. The
      original provider error is attached as <code>cause</code>.
    </p>
    <CodeBlock code={ERROR_EXAMPLE} lang="ts" />
    <div className="flex flex-col gap-2">
      <Heading as="h3" id="error-codes">
        Codes
      </Heading>
      <ul className="list-none! pl-0! gap-0! rounded-md border border-dotted divide-y divide-dotted">
        <li className="px-4 py-3">
          <code>"unsupported"</code>: the adapter doesn't implement the method.
          Branch on <code>capabilities</code> to avoid hitting this path.
        </li>
        <li className="px-4 py-3">
          <code>"path_escape"</code>: a file or <code>cwd</code> path resolved
          outside the sandbox root. Always thrown by the local adapter's safety
          check.
        </li>
        <li className="px-4 py-3">
          <code>"not_found"</code>: referenced path or snapshot id does not
          exist.
        </li>
        <li className="px-4 py-3">
          <code>"timeout"</code>: <code>process.shell</code> or{" "}
          <code>process.exec</code> hit <code>options.timeout</code> and the
          partial output is attached to <code>cause</code>.
        </li>
        <li className="px-4 py-3">
          <code>"aborted"</code>: caller cancellation through{" "}
          <code>options.signal</code>.
        </li>
        <li className="px-4 py-3">
          <code>"provider"</code>: anything else. Inspect <code>cause</code> for
          the underlying error.
        </li>
      </ul>
    </div>
  </section>
);
