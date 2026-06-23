import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { docs, site } from "../apps/site/src/lib/llms";

const root = resolve(import.meta.dir, "..");

test("readmes only link to published documentation routes", () => {
  const paths = [
    "README.md",
    ...readdirSync(resolve(root, "packages")).map(
      (name) => `packages/${name}/README.md`
    ),
  ];
  const links = paths.flatMap((path) =>
    [
      ...readFileSync(resolve(root, path), "utf-8").matchAll(
        /\]\((https:\/\/sandbox-sdk\.sh\/[^)]+\.md)\)/gu
      ),
    ].map((match) => match[1])
  );
  const slugs = new Set(docs.map((doc) => doc.slug));

  expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    const url = new URL(link);
    const slug = url.pathname.slice(1, -3);

    expect(url.origin).toBe(site.baseUrl);
    expect(slugs.has(slug)).toBe(true);
  }
});
