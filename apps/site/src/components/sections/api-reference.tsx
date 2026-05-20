import { CodeBlock } from "@/components/code-block";
import { Heading } from "@/components/heading";
import { PropAccordionItem } from "@/components/prop-accordion-item";
import { Accordion } from "@/components/ui/accordion";

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
// removes files and directories recursively, idempotent:
// missing paths resolve successfully`;

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

// or kill it on a signal
await proc.kill("SIGTERM");

// either way, await the final result
const result = await proc.result;`;

const PORTS_EXAMPLE = `const { url, port } = await sandbox.ports.expose(3000, {
  protocol: "https",
});
// → { url: "https://abc-3000.sandbox-sdk.sh", port: 3000 }`;

const SNAPSHOTS_EXAMPLE = `import { supports } from "@sandbox-sdk/core";

if (supports(sandbox, "snapshotCreate")) {
  const snap = await sandbox.snapshots.create("after-bun-install");

  if (supports(sandbox, "snapshotRestore")) {
    await sandbox.snapshots.restore(snap.id);
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
        Reads a file as <code>ReadableStream&lt;Uint8Array&gt;</code>. Use it
        when files can be large, when forwarding bytes to another stream, or
        when agents should avoid buffering the whole file in memory.
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
        Removes a file or directory recursively. Idempotent: missing paths
        resolve successfully across all adapters, so callers don't need to
        special-case "not found".
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
              Working directory, relative to the sandbox root. Resolved through
              the same path-safety check as file ops. A <code>cwd</code> that
              escapes the root throws <code>SandboxError</code> with{" "}
              <code>code: "path_escape"</code>.
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
              <code>AbortSignal</code> for caller-driven cancellation. The local
              and Vercel adapters cancel in flight; other providers fail fast
              when already aborted and keep provider-specific cancellation
              behind <code>raw</code>.
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
        <code>output</code> to stream merged stdout + stderr,{" "}
        <code>kill()</code> to terminate, and <code>result</code> for the final{" "}
        <code>{`{ code, signal?, stdout, stderr }`}</code>.
      </p>
      <CodeBlock code={SPAWN_EXAMPLE} lang="ts" />
    </section>

    <section>
      <Heading as="h3" id="ports-expose">
        ports.expose(port, options?)
      </Heading>
      <p>
        Returns a public URL routed to <code>port</code> inside the sandbox.
        Adapters that can't tunnel (the local adapter) throw{" "}
        <code>SandboxError</code> with <code>code: "unsupported"</code>. Branch
        on <code>sandbox.capabilities.ports</code> first.
      </p>
      <CodeBlock code={PORTS_EXAMPLE} lang="ts" />
      <div className="flex flex-col gap-2">
        <Heading as="h4" id="ports-expose-options">
          Options
        </Heading>
        <Accordion className="rounded-md border-dotted" type="multiple">
          <PropAccordionItem name="host" status="optional" value="host">
            <p>
              Host inside the sandbox the public URL forwards to. Defaults to{" "}
              <code>"127.0.0.1"</code>.
            </p>
          </PropAccordionItem>
          <PropAccordionItem name="protocol" status="optional" value="protocol">
            <p>
              Wire protocol: <code>"http"</code>, <code>"https"</code>, or{" "}
              <code>"tcp"</code>. Each adapter advertises which protocols it
              supports through <code>capabilities</code>; an unsupported choice
              throws at <code>expose()</code> time.
            </p>
          </PropAccordionItem>
        </Accordion>
      </div>
    </section>

    <section>
      <Heading as="h3" id="snapshots">
        snapshots.create(name?) / snapshots.restore(id)
      </Heading>
      <p>
        Captures provider state when <code>snapshotCreate</code> is supported.
        Restore means in-place restore of the current sandbox and is tracked
        separately with <code>snapshotRestore</code>. To create a fresh sandbox
        from a snapshot, pass <code>snapshot</code> to <code>create()</code> on
        adapters that advertise <code>snapshotSource</code>.
      </p>
      <CodeBlock code={SNAPSHOTS_EXAMPLE} lang="ts" />
    </section>
  </section>
);
