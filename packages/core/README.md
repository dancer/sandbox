# @sandbox-sdk/core

Typed primitives for Sandbox SDK.

## Install

```bash
bun add @sandbox-sdk/core @sandbox-sdk/local
```

## Use

```ts
import { withSandbox } from "@sandbox-sdk/core";
import { local } from "@sandbox-sdk/local";

const output = await withSandbox(
  { adapter: local(), cwd: "/workspace" },
  async (sandbox) => {
    await sandbox.files.write("hello.txt", "hello");
    return sandbox.process.exec("cat", ["hello.txt"]);
  }
);

console.log(output.stdout);
```

Install the adapter package for the runtime you want to use. The core package
provides the shared `Sandbox` contract, capability checks, normalized errors,
and cleanup helpers.

Read the [documentation](https://sandbox-sdk.sh/quick-start.md) and the
[adapter authoring guide](https://sandbox-sdk.sh/adapter-authoring.md).

## License

MIT
