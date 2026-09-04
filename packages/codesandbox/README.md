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

## Native Client

When application code also needs the native sandbox or host-token managers,
reuse `CodeSandboxClient` through the adapter:

```ts
import { create } from "@sandbox-sdk/core";
import { CodeSandboxClient, codesandbox } from "@sandbox-sdk/codesandbox";

const client = new CodeSandboxClient(process.env.CSB_API_KEY);
const sandbox = await create({ adapter: codesandbox({ client }) });
const resumed = await client.sandboxes.resume(sandbox.id);
```

The injected client handles the adapter's provider requests too, so normalized
operations and native managers use the same credentials and transport.

Read the [CodeSandbox adapter documentation](https://sandbox-sdk.sh/adapters.md).

## Cleanup

`stop()` disconnects the session and shuts down the VM by default, saving files
for a clean boot. Use `stop: "hibernate"` for resumable memory state,
`"disconnect"` to leave the VM running, or `"delete"` for permanent deletion.

`withSandbox()` applies this cleanup even for an existing sandbox id. Consume
streams inside its callback. See the [lifecycle guide](https://sandbox-sdk.sh/lifecycle.md).

## License

MIT
