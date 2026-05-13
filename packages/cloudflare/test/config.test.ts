import { expect, test } from "bun:test";

import { create } from "@sandbox-sdk/core";

import { cloudflare } from "../src/index";

test("cloudflare reports missing durable object binding", async () => {
  await expect(
    create({ adapter: cloudflare({} as Parameters<typeof cloudflare>[0]) })
  ).rejects.toMatchObject({
    code: "configuration",
    provider: "cloudflare",
  });
});
