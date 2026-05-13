import { expect, test } from "bun:test";

import { create } from "@sandbox-sdk/core";

import { e2b } from "../src/index";

const restore = (name: string, value: string | undefined): void => {
  process.env[name] = value ?? "";
};

test("e2b reports missing credentials before provider calls", async () => {
  const apiKey = process.env.E2B_API_KEY;
  const accessToken = process.env.E2B_ACCESS_TOKEN;
  process.env.E2B_API_KEY = "";
  process.env.E2B_ACCESS_TOKEN = "";

  try {
    await expect(create({ adapter: e2b() })).rejects.toMatchObject({
      code: "configuration",
      provider: "e2b",
    });
  } finally {
    restore("E2B_API_KEY", apiKey);
    restore("E2B_ACCESS_TOKEN", accessToken);
  }
});
