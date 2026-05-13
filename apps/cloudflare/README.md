# cloudflare live validation

This Worker validates the real `@sandbox-sdk/cloudflare` adapter against a Cloudflare Sandbox Durable Object binding.

## deploy

```bash
bun install
bun run --cwd apps/cloudflare deploy
```

Set the live test URL after deploy:

```bash
export CLOUDFLARE_SANDBOX_WORKER_URL="https://sandbox-sdk-cloudflare-live.your-account.workers.dev"
bun run test:live
```

To require a bearer token:

```bash
bunx wrangler secret put SANDBOX_SDK_TOKEN --cwd apps/cloudflare
export CLOUDFLARE_SANDBOX_TOKEN="same-value"
```

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

The live validation endpoint does not expose ports by default. Cloudflare preview URLs require wildcard custom-domain routing in production, and `.workers.dev` does not support the wildcard subdomains required by `exposePort()`.

If you test ports locally with `wrangler dev`, add `EXPOSE` directives for every port you plan to expose in `Dockerfile`. Port `3000` is reserved by the Cloudflare Sandbox runtime.
