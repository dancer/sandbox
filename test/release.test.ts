import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

type Changesets = Readonly<{
  access?: string;
  fixed?: readonly (readonly string[])[];
}>;

type Manifest = Readonly<{
  name: string;
  publishConfig?: Readonly<{
    access?: string;
  }>;
  version: string;
}>;

test("publishable packages share one fixed release group", () => {
  const config = JSON.parse(
    readFileSync(resolve(root, ".changeset/config.json"), "utf-8")
  ) as Changesets;
  const manifests = readdirSync(resolve(root, "packages")).map(
    (name) =>
      JSON.parse(
        readFileSync(resolve(root, "packages", name, "package.json"), "utf-8")
      ) as Manifest
  );
  const names = manifests.map((manifest) => manifest.name).toSorted();
  const groups = config.fixed?.map((group) => [...group].toSorted());
  const versions = new Set(manifests.map((manifest) => manifest.version));

  expect(config.access).toBe("public");
  expect(groups).toEqual([names]);
  expect(versions.size).toBe(1);
  for (const manifest of manifests) {
    expect(manifest.publishConfig?.access).toBe("public");
  }
});
