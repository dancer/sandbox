# @sandbox-sdk/modal

Modal Sandbox adapter for Sandbox SDK.

## Install

```bash
bun add @sandbox-sdk/core @sandbox-sdk/modal
```

## Use

```ts
import { withSandbox } from "@sandbox-sdk/core";
import { modal } from "@sandbox-sdk/modal";

await withSandbox({ adapter: modal(), cwd: "/workspace" }, async (sandbox) =>
  sandbox.process.shell("pwd")
);
```

Set `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`, or use Modal CLI configuration.
Filesystem snapshots create images for fresh sandboxes. Native tunnel, volume,
GPU, and connect-token controls remain available through `sandbox.raw`.

Read the [Modal adapter documentation](https://sandbox-sdk.sh/adapters.md).

## License

MIT
