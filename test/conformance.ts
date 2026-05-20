import { expect, test } from "bun:test";

import { create, supports } from "@sandbox-sdk/core";
import type { Adapter, Sandbox } from "@sandbox-sdk/core";

export type Conformance = Readonly<{
  adapter: () => Adapter;
  cwd?: string;
  name: string;
  port?: number;
}>;

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);

const text = (value: Uint8Array): string => new TextDecoder().decode(value);

const read = (value: ReadableStream<Uint8Array>): Promise<string> =>
  new Response(value).text();

const sandbox = (input: Conformance): Promise<Sandbox> =>
  create({ adapter: input.adapter(), cwd: input.cwd ?? "/workspace" });

const stop = async (value: Sandbox | undefined): Promise<void> => {
  if (value !== undefined) {
    await value.stop();
  }
};

export const conformance = (input: Conformance): void => {
  test(`${input.name} conforms to sandbox metadata`, async () => {
    const current = await sandbox(input);
    try {
      expect(current.provider).toBe(input.adapter().provider);
      expect(current.cwd).toBe(input.cwd ?? "/workspace");
      expect(current.capabilities).toEqual(input.adapter().capabilities);
      expect(current.id).toBeString();
      expect(current.raw).toBeDefined();
    } finally {
      await stop(current);
    }
  });

  test(`${input.name} conforms to files`, async () => {
    const current = await sandbox(input);
    try {
      const base = `${current.cwd}/nested`;

      await current.files.mkdir(base);
      await current.files.write(`${base}/text.txt`, "hello");
      await current.files.write(`${base}/bytes.bin`, bytes("bytes"));
      await current.files.write(`${base}/buffer.bin`, bytes("buffer").buffer);
      await current.files.write(`${base}/blob.txt`, new Blob(["blob"]));
      await current.files.write(
        `${base}/stream.txt`,
        new Blob(["stream"]).stream()
      );

      const entries = await current.files.list(base);

      expect(await current.files.exists(base)).toBe(true);
      expect(await current.files.exists(`${base}/text.txt`)).toBe(true);
      expect(await current.files.text(`${base}/text.txt`)).toBe("hello");
      expect(text(await current.files.read(`${base}/bytes.bin`))).toBe("bytes");
      expect(await read(await current.files.stream(`${base}/blob.txt`))).toBe(
        "blob"
      );
      expect(entries.map((entry) => entry.path).toSorted()).toEqual([
        `${base}/blob.txt`,
        `${base}/buffer.bin`,
        `${base}/bytes.bin`,
        `${base}/stream.txt`,
        `${base}/text.txt`,
      ]);

      await current.files.remove(`${base}/text.txt`);
      expect(await current.files.exists(`${base}/text.txt`)).toBe(false);
    } finally {
      await stop(current);
    }
  });

  test(`${input.name} conforms to process execution`, async () => {
    const current = await sandbox(input);
    try {
      if (!supports(current, "processExec")) {
        return;
      }

      await current.files.write(`${current.cwd}/value.txt`, "process");

      const exec = await current.process.exec("cat", ["value.txt"]);
      const shell = await current.process.shell("printf shell");
      const env = await current.process.exec("printenv", ["CONFORMANCE_ENV"], {
        env: { CONFORMANCE_ENV: "ok" },
      });

      expect(exec).toMatchObject({
        code: 0,
        ok: true,
        stdout: "process",
      });
      expect(shell.stdout).toBe("shell");
      expect(env.stdout.trim()).toBe("ok");
    } finally {
      await stop(current);
    }
  });

  test(`${input.name} conforms to background processes`, async () => {
    const current = await sandbox(input);
    try {
      if (!supports(current, "processSpawn")) {
        return;
      }

      const running = await current.process.spawn("sh", [
        "-c",
        "printf background",
      ]);
      const shell = await current.process.spawnShell("printf shell");

      expect(running.id).toBeString();
      expect(await read(running.output)).toBe("background");
      expect(await read(shell.output)).toBe("shell");
      expect(await running.result).toMatchObject({
        code: 0,
        ok: true,
        stdout: "background",
      });
      expect(await shell.result).toMatchObject({
        code: 0,
        ok: true,
        stdout: "shell",
      });
    } finally {
      await stop(current);
    }
  });

  test(`${input.name} conforms to ports`, async () => {
    const current = await sandbox(input);
    try {
      if (!supports(current, "ports")) {
        return;
      }

      const value = input.port ?? 3000;
      const preview = await current.ports.expose(value);

      expect(preview.port).toBe(value);
      expect(preview.url).toBeString();
    } finally {
      await stop(current);
    }
  });

  test(`${input.name} conforms to snapshots`, async () => {
    const current = await sandbox(input);
    try {
      if (
        !(
          supports(current, "snapshotCreate") &&
          supports(current, "snapshotRestore")
        )
      ) {
        return;
      }

      await current.files.write(`${current.cwd}/state.txt`, "before");
      const snapshot = await current.snapshots.create("conformance");
      await current.files.write(`${current.cwd}/state.txt`, "after");
      await current.snapshots.restore(snapshot.id);

      expect(snapshot.id).toBeString();
      expect(await current.files.text(`${current.cwd}/state.txt`)).toBe(
        "before"
      );
    } finally {
      await stop(current);
    }
  });
};
