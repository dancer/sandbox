# @sandbox-sdk/local

Local adapter for Sandbox SDK.

## Install

```bash
bun add @sandbox-sdk/core @sandbox-sdk/local
```

## Use

```ts
import { withSandbox } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";

await withSandbox({ adapter: local(), cwd: "/workspace" }, async (sandbox) => {
  await sandbox.files.write("main.ts", "console.log('hello')");
  return sandbox.process.shell("bun main.ts");
});
```

Use this adapter for local development and tests. It is not an isolation
boundary for untrusted code. Use a remote sandbox provider for untrusted agent
execution.

Read the [documentation](https://sandbox-sdk.sh/adapters.md).

## License

MIT
