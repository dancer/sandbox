# cloudflare live validation

This Worker validates the real `@sandbox-sdk/cloudflare` adapter against a Cloudflare Sandbox Durable Object binding.

## deploy

```bash
bun install
bun run --cwd apps/cloudflare deploy
```

Set the live test URL after deploy:

```bash
export CLOUDFLARE_SANDBOX_WORKER_URL="https://verify.sandbox-sdk.workers.dev"
bun run verify:cloudflare
```

Set the bearer token:

```bash
bunx wrangler secret put SANDBOX_SDK_TOKEN --cwd apps/cloudflare
export CLOUDFLARE_SANDBOX_TOKEN="same-value"
```

The live route requires `SANDBOX_SDK_TOKEN`. Without it, the Worker returns
`missing_token` so a deployed validation endpoint cannot run sandboxes
unauthenticated.

## binding

The Worker must export the Sandbox Durable Object class and bind it in `wrangler.jsonc`.

```ts
export { Sandbox } from "@cloudflare/sandbox";
```

```jsonc
{
  "containers": [
    {
      "class_name": "Sandbox",
      "image": "./Dockerfile",
      "instance_type": "lite",
      "max_instances": 1,
    },
  ],
  "durable_objects": {
    "bindings": [
      {
        "class_name": "Sandbox",
        "name": "Sandbox",
      },
    ],
  },
}
```

## ports

The live workflow endpoint runs on `.workers.dev`, but the optional port
verification test requires a custom domain with wildcard routing. `.workers.dev`
does not support the wildcard subdomains required by `exposePort()`.

Set the custom preview host locally before running the port verification:

```bash
export CLOUDFLARE_SANDBOX_PREVIEW_HOST="preview.example.com"
bun run verify:cloudflare
```

The Worker also accepts `SANDBOX_SDK_PREVIEW_HOST` as an environment value. The
test sends `CLOUDFLARE_SANDBOX_PREVIEW_HOST` in the authenticated request so the
same deployed Worker can validate multiple preview host setups.

If you test ports locally with `wrangler dev`, add `EXPOSE` directives for
every port you plan to expose in `Dockerfile`. Cloudflare accepts ports
1024-65535 and reserves port `3000` for the Sandbox runtime.
