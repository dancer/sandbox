import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { generate } from "./api.js";

test("api reference documents provider re-exports", async () => {
  const folder = await mkdtemp(join(tmpdir(), "sandbox-sdk-api-"));
  const output = join(folder, "api.md");

  try {
    await generate(output);
    const value = await readFile(output, "utf-8");

    expect(value).toContain("### functions");
    expect(value).toContain("### provider exports");
    expect(value).toContain("### values");
    expect(value).toContain("#### `CodeSandboxClient`");
    expect(value).toContain("#### `DaytonaClient`");
    expect(value).toContain("#### `local`");
    expect(value).toContain("#### `ModalClient`");
    expect(value).toContain("#### `rawCapabilities`");
    expect(value).toContain("#### `VercelSandbox`");
  } finally {
    await rm(folder, { force: true, recursive: true });
  }
});
