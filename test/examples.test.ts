import { expect, test } from "bun:test";

import { run } from "../examples/local.ts";

test("local example runs from its virtual working directory", async () => {
  expect(await run()).toBe("hello from local");
});
