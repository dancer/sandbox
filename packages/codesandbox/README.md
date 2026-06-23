# @sandbox-sdk/codesandbox

CodeSandbox adapter for Sandbox SDK.

## Install

```bash
bun add @sandbox-sdk/core @sandbox-sdk/codesandbox
```

## Use

```ts
import { withSandbox } from "@sandbox-sdk/core";
import { codesandbox } from "@sandbox-sdk/codesandbox";

await withSandbox(
  { adapter: codesandbox(), cwd: "/project/sandbox" },
  async (sandbox) => sandbox.process.shell("pwd")
);
```

Pass `token` or set `CSB_API_KEY`. Use `template` or `snapshot` to create a
fresh sandbox from an existing one. Native VM, preview token, terminal, and
watcher controls remain available through `sandbox.raw`.

Read the [CodeSandbox adapter documentation](https://sandbox-sdk.sh/adapters.md).

## License

MIT
