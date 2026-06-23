import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { generate } from "./api.js";

const root = process.cwd();
const docs = join(root, "docs/api.md");
const folder = await mkdtemp(join(tmpdir(), "sandbox-sdk-api-"));
const output = join(folder, "api.md");

try {
  await generate(output);

  const formatter = Bun.spawn(["bun", "x", "oxfmt", output], {
    cwd: root,
    stderr: "inherit",
    stdout: "inherit",
  });
  if ((await formatter.exited) !== 0) {
    throw new Error("unable to format generated api reference");
  }

  const [actual, expected] = await Promise.all([
    readFile(docs, "utf-8"),
    readFile(output, "utf-8"),
  ]);
  if (actual !== expected) {
    throw new Error("generated api reference is stale. run `bun run docs:api`");
  }
} finally {
  await rm(folder, { force: true, recursive: true });
}
