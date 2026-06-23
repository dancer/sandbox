import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

type Manifest = Readonly<{
  repository?: Readonly<{
    directory?: string;
    type?: string;
    url?: string;
  }>;
}>;

test("packages use public repository metadata", () => {
  for (const name of readdirSync(resolve(root, "packages"))) {
    const path = resolve(root, "packages", name, "package.json");
    const manifest = JSON.parse(readFileSync(path, "utf-8")) as Manifest;

    expect(manifest.repository).toEqual({
      directory: `packages/${name}`,
      type: "git",
      url: "git+https://github.com/dancer/sandbox.git",
    });
  }
});
