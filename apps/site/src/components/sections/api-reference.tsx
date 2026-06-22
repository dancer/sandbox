import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";
import { PropAccordionItem } from "@/components/prop-accordion-item";
import { Accordion } from "@/components/ui/accordion";

const EXPORTS_EXAMPLE = `import {
  capabilityMode,
  create,
  isSandboxError,
  SandboxError,
  supports,
  withSandbox,
} from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";

const sandbox = await create({ adapter: local() });

if (supports(sandbox, "ports")) {
  await sandbox.ports.expose(3000);
}`;

const READ_EXAMPLE = `// raw bytes
const bytes = await sandbox.files.read("data/in.bin");
// → Uint8Array

// utf-8 text
const source = await sandbox.files.text("main.ts");`;

const STREAM_EXAMPLE = `const stream = await sandbox.files.stream("data/large.bin");

for await (const chunk of stream) {
  await destination.write(chunk);
}`;

const WRITE_EXAMPLE = `await sandbox.files.write("main.ts", "console.log('hi')");
await sandbox.files.write("data/in.bin", new Uint8Array([0x68, 0x69]));
await sandbox.files.write("upload.bin", file.stream()); // ReadableStream`;

const LIST_EXAMPLE = `const entries = await sandbox.files.list("src");
// → readonly Entry[] sorted by path
//   each entry: { path, kind: "file" | "directory", size?, modified? }`;

const REMOVE_EXAMPLE = `await sandbox.files.remove("dist");
// removes files and directories recursively when the provider supports it`;

const SHELL_EXAMPLE = `const result = await sandbox.process.shell("bun main.ts", {
  cwd: "src",
  env: { NODE_ENV: "production" },
  signal: controller.signal,
  timeout: 30_000,
});
// → { code, signal?, stdout, stderr }`;

const EXEC_EXAMPLE = `const result = await sandbox.process.exec("bun", ["main.ts"], {
  cwd: "src",
});
// → argv execution without shell parsing`;

const SPAWN_EXAMPLE = `const proc = await sandbox.process.spawn("bun", ["watch.ts"]);

// stream merged stdout + stderr as bytes flow
for await (const chunk of proc.output) {
  process.stdout.write(chunk);
}

// providers with separate streams expose stdout and stderr too
const stdout = proc.stdout ? await new Response(proc.stdout).text() : "";
const stderr = proc.stderr ? await new Response(proc.stderr).text() : "";

// or kill it on a signal
await proc.kill("SIGTERM");

// either way, await the final result
const result = await proc.result;`;

const PORTS_EXAMPLE = `const preview = await sandbox.ports.expose(3000, {
  protocol: "https",
});

const response = await preview.request("/health");

console.log(preview.url, preview.port, response.status);`;

const SNAPSHOTS_EXAMPLE = `import { supports } from "@sandbox-sdk/core";

if (supports(sandbox, "snapshotCreate")) {
  const snap = await sandbox.snapshots.create();

  if (supports(sandbox, "snapshotRestore")) {
    await sandbox.snapshots.restore(snap.id);
  }

  if (supports(sandbox, "snapshotDelete")) {
    await sandbox.snapshots.delete(snap.id);
  }
}`;

export const ApiReference = () => (
  <section>
    <Heading as="h2" number={5}>
      API reference
    </Heading>
    <p>
      Every method lives on the <code>Sandbox</code> instance returned by{" "}
      <code>create()</code>. The unified surface only covers what every adapter
      can do cleanly; anything provider-specific lives on{" "}
      <code>sandbox.raw</code>.
    </p>

    <section>
      <Heading as="h3" id="exports">
        Top-level exports
      </Heading>
      <p>
        These come from <code>@sandbox-sdk/core</code>. <code>create</code> and{" "}
        <code>withSandbox</code> produce the sandbox; the capability helpers let
        you branch on what a provider supports before calling into it.
      </p>
      <CodeBlock code={EXPORTS_EXAMPLE} lang="ts" />
      <ul className="list-none! pl-0! gap-0! rounded-md border border-dotted divide-y divide-dotted">
        <li className="px-4 py-3">
          <code>create(options)</code>: creates or connects to a sandbox and
          returns a typed <code>Sandbox</code>.
        </li>
        <li className="px-4 py-3">
          <code>withSandbox(options, fn)</code>: runs <code>fn</code> with a
          sandbox and stops it after success or failure.
        </li>
        <li className="px-4 py-3">
          <code>supports(sandbox, capability)</code>: returns <code>true</code>{" "}
          when a normalized capability is available.
        </li>
        <li className="px-4 py-3">
          <code>capabilityMode(sandbox, capability)</code>: returns the
          provider-specific mode for a capability, such as <code>"disk"</code>{" "}
          versus <code>"memory"</code> snapshots.
        </li>
        <li className="px-4 py-3">
          <code>supportsRaw(...)</code> / <code>rawCapabilityMode(...)</code>:
          the same checks for powers reached through <code>sandbox.raw</code>.
        </li>
        <li className="px-4 py-3">
          <code>requireCapability(...)</code> /{" "}
          <code>requireRawCapability(...)</code>: throw{" "}
          <code>SandboxError</code> with <code>code: "unsupported"</code> when a
          capability is missing.
        </li>
        <li className="px-4 py-3">
          <code>SandboxError</code> / <code>isSandboxError(error)</code>: the
          normalized error class and a type guard for it.
        </li>
        <li className="px-4 py-3">
          <code>fromSandboxRuntime(runtime)</code>: for adapter authors, lifts a
          low-level <code>SandboxRuntime</code> into the public{" "}
          <code>Sandbox</code> API, using direct bounded commands when available
          and stream-first process handles otherwise.
        </li>
      </ul>
    </section>

    <section>
      <Heading as="h3" id="files-read">
        files.read(path) / files.text(path)
      </Heading>
      <p>
        Reads a file. <code>read</code> returns raw <code>Uint8Array</code>{" "}
        bytes; <code>text</code> decodes as UTF-8. Both throw{" "}
        <code>SandboxError</code> when the path escapes the sandbox root.
      </p>
      <CodeBlock code={READ_EXAMPLE} lang="ts" />
    </section>

    <section>
      <Heading as="h3" id="files-stream">
        files.stream(path)
      </Heading>
      <p>
        Reads a file as <code>ReadableStream&lt;Uint8Array&gt;</code>. Every
        adapter returns a web stream. For large files, check{" "}
        <code>capabilityMode(sandbox, "fileStreaming")</code>:{" "}
        <code>"native"</code> receives bytes incrementally, while{" "}
        <code>"buffered"</code> exposes a stream after the provider SDK has
        loaded the file.
      </p>
      <CodeBlock code={STREAM_EXAMPLE} lang="ts" />
    </section>

    <section>
      <Heading as="h3" id="files-write">
        files.write(path, input)
      </Heading>
      <p>
        Writes a file, creating parent directories as needed. Accepts{" "}
        <code>string</code>, <code>Uint8Array</code>, <code>ArrayBuffer</code>,{" "}
        <code>Blob</code>, or <code>ReadableStream&lt;Uint8Array&gt;</code>.
        Streams are drained before the write completes.
      </p>
      <CodeBlock code={WRITE_EXAMPLE} lang="ts" />
    </section>

    <section>
      <Heading as="h3" id="files-list">
        files.list(path?)
      </Heading>
      <p>
        Lists the immediate children of <code>path</code> (defaults to the
        sandbox cwd). Returns a sorted, frozen array of <code>Entry</code>{" "}
        values. Each carries <code>path</code>, <code>kind</code>, plus{" "}
        <code>size</code> and <code>modified</code> where the adapter has them
        cheaply.
      </p>
      <CodeBlock code={LIST_EXAMPLE} lang="ts" />
    </section>

    <section>
      <Heading as="h3" id="files-remove">
        files.remove(path)
      </Heading>
      <p>
        Removes a file or directory recursively when the provider supports it.
        Missing paths follow provider semantics, so catch{" "}
        <code>SandboxError</code> with <code>code: "not_found"</code> or{" "}
        <code>code: "provider"</code> when deleting optional paths.
      </p>
      <CodeBlock code={REMOVE_EXAMPLE} lang="ts" />
    </section>

    <section>
      <Heading as="h3" id="process-exec">
        process.shell(command, options?) / process.exec(command, args?,
        options?)
      </Heading>
      <p>
        Runs a command to completion, buffering stdout and stderr. Use{" "}
        <code>shell</code> for normal shell strings and <code>exec</code> for
        explicit argv execution.
      </p>
      <CodeBlock code={SHELL_EXAMPLE} lang="ts" />
      <CodeBlock code={EXEC_EXAMPLE} lang="ts" />
      <div className="flex flex-col gap-2">
        <Heading as="h4" id="process-exec-options">
          Options
        </Heading>
        <Accordion className="rounded-md border-dotted" type="multiple">
          <PropAccordionItem name="cwd" status="optional" value="cwd">
            <p>
              Working directory for the command. Cloud adapters forward this to
              the provider, so use the provider's sandbox path conventions. The
              local adapter resolves <code>cwd</code> inside its configured root
              and throws <code>SandboxError</code> with{" "}
              <code>code: "path_escape"</code> when it would escape.
            </p>
          </PropAccordionItem>
          <PropAccordionItem name="env" status="optional" value="env">
            <p>
              <code>Record&lt;string, string&gt;</code> passed to the process.
              Merge order follows adapter semantics, so prefer explicit
              application keys over overriding provider-managed values such as{" "}
              <code>PATH</code> or auth variables.
            </p>
          </PropAccordionItem>
          <PropAccordionItem name="timeout" status="optional" value="timeout">
            <p>
              Maximum runtime in milliseconds. After it elapses the adapter
              kills the process and rejects with <code>SandboxError</code>{" "}
              carrying the partial output.
            </p>
          </PropAccordionItem>
          <PropAccordionItem name="signal" status="optional" value="signal">
            <p>
              <code>AbortSignal</code> for caller-driven cancellation. Local,
              Vercel, and CodeSandbox exec paths cancel in flight. Background
              handles for Local, Vercel, Blaxel, CodeSandbox, and Daytona attach
              provider cleanup where available. Other providers fail fast when
              already aborted and keep provider-specific cancellation behind{" "}
              <code>raw</code>.
            </p>
          </PropAccordionItem>
        </Accordion>
      </div>
    </section>

    <section>
      <Heading as="h3" id="process-spawn">
        process.spawn(command, args?, options?)
      </Heading>
      <p>
        Starts <code>command</code> and returns a handle immediately. Use{" "}
        <code>output</code> to stream merged stdout + stderr, optional{" "}
        <code>stdout</code> and <code>stderr</code> when the provider exposes
        separate streams, <code>kill()</code> to terminate, and{" "}
        <code>result</code> for the final{" "}
        <code>{`{ code, signal?, stdout, stderr }`}</code>.
      </p>
      <CodeBlock code={SPAWN_EXAMPLE} lang="ts" />
    </section>

    <section>
      <Heading as="h3" id="ports-expose">
        ports.expose(port, options?)
      </Heading>
      <p>
        Returns a provider-aware preview for <code>port</code>. Its{" "}
        <code>request()</code> retains header-based access credentials outside
        serialized data. Use <code>request()</code> to call a same-origin
        endpoint. Local sandboxes return derived localhost URLs; provider
        adapters may return public tunnels, create-time port URLs, or reject
        unsupported exposure with <code>SandboxError</code>. Branch on{" "}
        <code>sandbox.capabilities.ports</code> first.
      </p>
      <p>
        Treat a provider-issued signed or tokenized <code>url</code> as a
        credential. It is intentionally usable by an external client and may
        therefore contain provider access data.
      </p>
      <p>
        Requests handle redirects manually by default and reject{" "}
        <code>redirect: "follow"</code>, so provider access headers cannot leave
        the preview origin.
      </p>
      <CodeBlock code={PORTS_EXAMPLE} lang="ts" />
      <div className="flex flex-col gap-2">
        <Heading as="h4" id="ports-expose-options">
          Options
        </Heading>
        <Accordion className="rounded-md border-dotted" type="multiple">
          <PropAccordionItem name="protocol" status="optional" value="protocol">
            <p>
              Wire protocol: <code>"http"</code>, <code>"https"</code>, or{" "}
              <code>"tcp"</code>. Protocol support is adapter-specific;{" "}
              <code>capabilities.ports</code> describes exposure mode, not
              protocol support. Unsupported choices throw at{" "}
              <code>expose()</code> time.
            </p>
          </PropAccordionItem>
          <PropAccordionItem name="token" status="optional" value="token">
            <p>
              Provider-issued preview URL token when the adapter supports it.
              Private provider headers stay inside{" "}
              <code>preview.request()</code> and never appear in a serialized
              preview result. Signed or tokenized URLs are still credentials.
            </p>
          </PropAccordionItem>
        </Accordion>
      </div>
    </section>

    <section>
      <Heading as="h3" id="snapshots">
        snapshots.create(name?) / snapshots.delete(id) / snapshots.restore(id)
      </Heading>
      <p>
        Captures provider state when <code>snapshotCreate</code> is supported.
        Snapshots can be removed with <code>delete()</code> when{" "}
        <code>snapshotDelete</code> is supported. For persistent provider
        snapshots, deletion is permanent. Restore means in-place restore of the
        current sandbox and is tracked separately with{" "}
        <code>snapshotRestore</code>. To create a fresh sandbox from a snapshot,
        pass <code>snapshot</code> to <code>create()</code> on adapters that
        advertise <code>snapshotSource</code>. Snapshot names are accepted only
        when the provider persists them. Other adapters reject a name rather
        than silently discarding it.
      </p>
      <CodeBlock code={SNAPSHOTS_EXAMPLE} lang="ts" />
    </section>
  </section>
);
