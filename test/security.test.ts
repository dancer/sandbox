import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

type Result =
  | { success: true; data: unknown }
  | { success: false; error: { issues: unknown[] } };

interface Schema {
  length(value: number): Schema;
  max(value: number, message?: string): Schema;
  min(value: number): Schema;
  parse(value: unknown): unknown;
  refine(callback: () => boolean): Schema;
  safeParse(value: unknown): Result;
  safeParseAsync(value: unknown): Promise<Result>;
  size(value: number): Schema;
}

interface Validator {
  array(schema: Schema): Schema;
  object(shape: Record<string, Schema>): Schema;
  set(schema: Schema): Schema;
  string(): Schema;
}

const require = createRequire(import.meta.url);
const consumers = [
  "@vercel/backends",
  "@vercel/express",
  "@vercel/hono",
  "@vercel/python-analysis",
];
const vercel = createRequire(require.resolve("vercel/package.json"));
const legacy = createRequire(vercel.resolve(consumers[0]));
const root = dirname(legacy.resolve("zod/package.json"));

for (const entry of ["lib/index.js", "lib/index.mjs", "lib/index.umd.js"]) {
  test(`legacy Zod rejects oversized collections before parsing elements in ${entry}`, async () => {
    const exports = await import(pathToFileURL(join(root, entry)).href);
    const validator = (exports.default ?? exports) as Validator;
    let visited = 0;
    let refined = 0;
    const element = validator.string().refine(() => {
      visited += 1;
      return true;
    });
    const bounded = validator
      .array(element)
      .max(1, "too many")
      .refine(() => {
        refined += 1;
        return true;
      });
    for (const [schema, input, issue] of [
      [bounded, ["a", "b"], { code: "too_big", message: "too many" }],
      [
        validator.array(element).length(1),
        ["a", "b"],
        { code: "too_big", exact: true },
      ],
      [
        validator.object({ files: validator.array(element).max(1) }),
        { files: [1, 2] },
        { code: "too_big", path: ["files"] },
      ],
      [validator.set(element).max(1), new Set(["a", "b"]), { code: "too_big" }],
      [validator.set(element).size(1), new Set([1, 2]), { code: "too_big" }],
    ] as const) {
      for (const result of [
        schema.safeParse(input),
        await schema.safeParseAsync(input),
      ]) {
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues).toMatchObject([issue]);
          expect(result.error.issues).toHaveLength(1);
        }
      }
    }
    expect([visited, refined]).toEqual([0, 0]);
    expect(bounded.parse(["a"])).toEqual(["a"]);
    expect(validator.array(element).length(1).parse(["a"])).toEqual(["a"]);
    expect(
      validator
        .set(element)
        .size(1)
        .parse(new Set(["a"]))
    ).toEqual(new Set(["a"]));
    expect(validator.array(element).min(1).safeParse([]).success).toBe(false);
    expect(validator.array(element).max(1).safeParse([1]).success).toBe(false);
    expect(validator.array(element).parse(["a", "b"])).toEqual(["a", "b"]);
  });
}

test("every legacy Vercel validator uses the patched Zod package", () => {
  for (const consumer of consumers) {
    const dependency = createRequire(vercel.resolve(consumer));
    expect(dependency.resolve("zod/package.json")).toBe(
      legacy.resolve("zod/package.json")
    );
  }
});

test("the Zod advisory exception only covers the patched legacy version", () => {
  const manifest = require("../package.json") as {
    patchedDependencies: Record<string, string>;
  };
  expect(manifest.patchedDependencies?.["zod@3.22.4"]).toBe(
    "patches/zod.patch"
  );
  const lock = Bun.JSONC.parse(
    readFileSync(new URL("../bun.lock", import.meta.url), "utf-8")
  ) as { packages: Record<string, [string, ...unknown[]]> };
  const versions = Object.values(lock.packages)
    .map(([name]) => name)
    .filter((name) => name.startsWith("zod@"))
    .map((name) => name.slice(4));
  expect(new Set(versions)).toEqual(new Set(["3.22.4", "4.6.7"]));
});
