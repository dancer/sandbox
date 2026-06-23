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

## Native Client

For Modal service managers that are not tied to one sandbox, reuse a native
client through the adapter:

```ts
import { create } from "@sandbox-sdk/core";
import { ModalClient, modal } from "@sandbox-sdk/modal";

const client = new ModalClient();
const sandbox = await create({ adapter: modal({ client }) });
const app = await client.apps.fromName("sandbox-sdk");
```

The injected client handles the adapter's provider requests too, so native app,
image, volume, and secret calls share its credentials and transport.

Read the [Modal adapter documentation](https://sandbox-sdk.sh/adapters.md).

## License

MIT
