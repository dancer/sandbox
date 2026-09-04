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

## Runtime Controls

To change outbound access while a sandbox runs, configure allowlists at creation.
Modal cannot restrict a sandbox that started with its unrestricted network default.
Start open with `outboundCidrAllowlist: ["0.0.0.0/0"]` and
`outboundDomainAllowlist: ["*"]`, then call
`sandbox.raw.updateNetworkPolicy()` with both lists. Empty lists block outbound
traffic, and updates terminate existing connections no longer allowed by the policy.

Use `sandbox.raw.filesystem.watch(path, { timeoutMs })` to iterate file events.
Pass an absolute sandbox path and stop the iterator when finished. Watch timeouts
are truncated to whole seconds and end iteration without throwing.

See the [Modal SDK reference](https://modal.com/docs/sdk/js/latest/Sandbox).

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

## Cleanup

`stop()` terminates the sandbox by default. `stop: "detach"` leaves it running;
use volumes or filesystem snapshots when data must survive termination.

`withSandbox()` applies this cleanup even for an existing sandbox id. Consume
streams inside its callback. See the [lifecycle guide](https://sandbox-sdk.sh/lifecycle.md).

## License

MIT
