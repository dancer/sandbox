import { create } from "@sandbox-sdk/core";
import type { Sandbox } from "@sandbox-sdk/core";
import type { VercelRaw } from "@sandbox-sdk/vercel";
import { vercel } from "@sandbox-sdk/vercel";

const cwd = "/vercel/sandbox";

export const run = async (): Promise<string> => {
  const source = await create({
    adapter: vercel({ persistent: true, runtime: "node24" }),
    cwd,
    timeout: 300_000,
  });
  let fork: Sandbox<VercelRaw> | undefined;

  try {
    const file = `${cwd}/message.txt`;
    await source.files.write(file, "hello from a Vercel fork");
    await source.stop();

    fork = await create({
      adapter: vercel({ fork: { sourceSandbox: source.id } }),
      cwd,
      timeout: 300_000,
    });

    return fork.files.text(file);
  } finally {
    await Promise.all([
      source.raw.delete(),
      fork === undefined ? Promise.resolve() : fork.raw.delete(),
    ]);
  }
};
