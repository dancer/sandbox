import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

const dependency = (...names: string[]): NodeJS.Require => {
  let require = createRequire(import.meta.url);
  for (const name of names) {
    require = createRequire(require.resolve(name));
  }
  return require;
};

type Parser = Readonly<{ parse(input: string): unknown }>;

test("blaxel TOML configuration preserves values and rejects prototype traversal", () => {
  const require = dependency("@sandbox-sdk/blaxel", "@blaxel/core");
  const parser = require("smol-toml") as Parser;
  expect(parser.parse('[env]\nGREETING = "hello"\nCOUNT = 2')).toEqual({
    env: { COUNT: 2, GREETING: "hello" },
  });
  expect(() =>
    parser.parse('[a.b]\ny = 1\n[a.b.y.__proto__.__proto__]\npolluted = "yes"')
  ).toThrow();
  expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
  expect(() =>
    parser.parse(`value = ${"[".repeat(3000)}1${"]".repeat(3000)}`)
  ).toThrow();
});

test("vercel archive updates preserve streaming extraction", async () => {
  const archive = dependency("vercel/package.json", "@vercel/fun")("tar") as {
    create(options: { cwd: string }, files: string[]): Readable;
    extract(options: { C: string; strip: number }): Writable;
  };
  const source = await mkdtemp(join(tmpdir(), "sandbox-archive-"));
  const target = await mkdtemp(join(tmpdir(), "sandbox-extract-"));
  try {
    await writeFile(join(source, "runtime"), "sandbox");
    await pipeline(
      archive.create({ cwd: source }, ["runtime"]),
      archive.extract({ C: target, strip: 0 })
    );
    expect(await readFile(join(target, "runtime"), "utf-8")).toBe("sandbox");
  } finally {
    await Promise.all([
      rm(source, { force: true, recursive: true }),
      rm(target, { force: true, recursive: true }),
    ]);
  }
});

test("codesandbox telemetry retains its optional SDK entrypoints", () => {
  const telemetry: unknown = dependency(
    "@sandbox-sdk/codesandbox",
    "@codesandbox/sdk"
  )("@sentry/node");
  expect(telemetry).toMatchObject({
    captureException: expect.any(Function),
    init: expect.any(Function),
    isInitialized: expect.any(Function),
  });
});

test("yaml security updates preserve changesets and Vercel tooling APIs", () => {
  const workspace = dependency(
    "@changesets/cli",
    "@manypkg/get-packages",
    "@manypkg/tools"
  )("yaml") as Parser;
  const modern = dependency(
    "vercel/package.json",
    "@vercel/python-analysis"
  )("js-yaml") as {
    load(input: string): unknown;
  };
  expect(workspace.parse("packages:\n  - packages/*")).toEqual({
    packages: ["packages/*"],
  });
  expect(modern.load("runtime: python3.13")).toEqual({ runtime: "python3.13" });
});

test("codesandbox XML parsing preserves callback output without prototype mutation", async () => {
  const parser = dependency(
    "@sandbox-sdk/codesandbox",
    "@codesandbox/sdk",
    "blessed-contrib",
    "map-canvas"
  )("xml2js") as {
    parseString(
      input: string,
      callback: (error: Error | null, value: unknown) => void
    ): void;
  };
  const output = await promisify(parser.parseString)(
    "<map><name>world</name><__proto__><polluted>yes</polluted></__proto__></map>"
  );
  expect(output).toMatchObject({ map: { name: ["world"] } });
  expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
});

test("lockfile downloads do not depend on private registry hosts", () => {
  const lock = readFileSync(new URL("../bun.lock", import.meta.url), "utf-8");
  const urls = lock.matchAll(/"(https:\/\/[^"\s]+\.tgz)"/gu);
  for (const [, value] of urls) {
    expect(new URL(value ?? "").hostname).toBe("registry.npmjs.org");
  }
});

test("upgraded glob preserves provider traversal and cancellation", async () => {
  const root = await mkdtemp(join(tmpdir(), "sandbox-glob-"));
  try {
    await Promise.all([
      writeFile(join(root, "file.txt"), "file"),
      writeFile(join(root, ".hidden.txt"), "hidden"),
      writeFile(join(root, "ignored.tmp"), "ignored"),
    ]);
    for (const names of [
      ["@sandbox-sdk/e2b", "e2b"],
      ["@sandbox-sdk/blaxel", "@blaxel/core", "archiver", "archiver-utils"],
    ]) {
      const matcher = dependency(...names)("glob") as {
        glob(
          pattern: string,
          options: { cwd: string; dot?: boolean; signal?: AbortSignal }
        ): Promise<string[]>;
        globSync(
          pattern: string,
          options: { cwd: string; dot?: boolean }
        ): string[];
      };
      const files = await matcher.glob("**/*.txt", { cwd: root, dot: true });
      expect(files.toSorted()).toEqual([".hidden.txt", "file.txt"]);
      expect(matcher.globSync("**/*.txt", { cwd: root })).toEqual(["file.txt"]);
      await expect(
        matcher.glob("**/*", { cwd: root, signal: AbortSignal.abort() })
      ).rejects.toBeDefined();
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("upgraded minimatch preserves Vercel file pattern APIs", () => {
  const matcher = dependency(
    "vercel/package.json",
    "@vercel/python-analysis"
  )("minimatch") as {
    minimatch(path: string, pattern: string): boolean;
    match(paths: string[], pattern: string): string[];
  };
  expect(matcher.minimatch("src/main.py", "**/*.{py,pyi}")).toBe(true);
  expect(matcher.minimatch("src/main.ts", "**/*.{py,pyi}")).toBe(false);
  expect(matcher.match(["src/main.py", "src/main.ts"], "**/*.py")).toEqual([
    "src/main.py",
  ]);
});
