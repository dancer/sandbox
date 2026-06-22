import { Buffer } from "node:buffer";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type Status = "missing" | "partial" | "ready";

type Row = Readonly<{
  command: string;
  details: string;
  provider: string;
  status: Status;
}>;

type Context = Readonly<{
  env?: Readonly<Record<string, string | undefined>>;
  exists?: (path: string) => boolean;
  home?: string;
  now?: number;
}>;

type Oidc = Readonly<{
  details: string;
  status: Status;
}>;

type Claims = Readonly<{
  exp?: number;
  owner_id?: string;
  project_id?: string;
}>;

const current = (context: Context): Required<Context> => ({
  env: context.env ?? process.env,
  exists: context.exists ?? existsSync,
  home: context.home ?? homedir(),
  now: context.now ?? Date.now(),
});

const envValue = (name: string, context: Context): string | undefined => {
  const active = current(context).env[name]?.trim();
  return active === "" ? undefined : active;
};

const has = (name: string, context: Context): boolean =>
  envValue(name, context) !== undefined;

const all = (names: readonly string[], context: Context): boolean =>
  names.every((name) => has(name, context));

const any = (names: readonly string[], context: Context): boolean =>
  names.some((name) => has(name, context));

const modalConfig = (context: Context): boolean => {
  const active = current(context);
  const path = envValue("MODAL_CONFIG_PATH", context);
  return active.exists(path ?? join(active.home, ".modal.toml"));
};

const blaxelConfig = (context: Context): boolean =>
  current(context).exists(
    join(current(context).home, ".blaxel", "config.yaml")
  );

const decode = (value: string): unknown => {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf-8"));
};

const claims = (token: string): Claims | undefined => {
  try {
    const payload = decode(token.split(".")[1] ?? "");
    if (typeof payload !== "object" || payload === null) {
      return undefined;
    }
    return {
      ...("exp" in payload && typeof payload.exp === "number"
        ? { exp: payload.exp }
        : {}),
      ...("owner_id" in payload && typeof payload.owner_id === "string"
        ? { owner_id: payload.owner_id }
        : {}),
      ...("project_id" in payload && typeof payload.project_id === "string"
        ? { project_id: payload.project_id }
        : {}),
    };
  } catch {
    return undefined;
  }
};

const oidc = (token: string, now: number): Oidc => {
  const payload = claims(token);
  if (payload?.owner_id === undefined || payload.project_id === undefined) {
    return {
      details:
        "VERCEL_OIDC_TOKEN is invalid; run `vercel env pull .env.local --scope birthstone --yes`",
      status: "missing",
    };
  }
  if (payload.exp !== undefined && payload.exp * 1000 <= now) {
    return {
      details:
        "VERCEL_OIDC_TOKEN expired; run `vercel env pull .env.local --scope birthstone --yes`",
      status: "missing",
    };
  }
  if (payload.exp !== undefined && payload.exp * 1000 - now <= 60 * 60 * 1000) {
    return {
      details:
        "VERCEL_OIDC_TOKEN expires soon; run `vercel env pull .env.local --scope birthstone --yes` before longer verification",
      status: "partial",
    };
  }
  return {
    details: "ready",
    status: "ready",
  };
};

const validUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

const value = (name: string, context: Context): string | undefined =>
  envValue(name, context);

const ready = (details = "ready"): Pick<Row, "details" | "status"> => ({
  details,
  status: "ready",
});

const missing = (details: string): Pick<Row, "details" | "status"> => ({
  details,
  status: "missing",
});

const partial = (details: string): Pick<Row, "details" | "status"> => ({
  details,
  status: "partial",
});

const row = (
  provider: string,
  command: string,
  result: Pick<Row, "details" | "status">
): Row => ({
  command,
  details: result.details,
  provider,
  status: result.status,
});

const complete = (
  provider: string,
  command: string,
  requirements: readonly string[],
  ok: boolean
): Row =>
  row(
    provider,
    command,
    ok
      ? { details: "ready", status: "ready" }
      : missing(requirements.join(" or "))
  );

const blaxelRow = (context: Context): Row => {
  const explicit =
    has("BL_WORKSPACE", context) &&
    any(["BL_API_KEY", "BL_CLIENT_CREDENTIALS"], context);
  const config = blaxelConfig(context);
  const partialConfig = any(
    ["BL_WORKSPACE", "BL_API_KEY", "BL_CLIENT_CREDENTIALS"],
    context
  );
  if (explicit) {
    return row("blaxel", "bun run verify:blaxel", ready());
  }
  if (config) {
    return row(
      "blaxel",
      "bun run verify:blaxel",
      ready("ready from blaxel cli config")
    );
  }
  return row(
    "blaxel",
    "bun run verify:blaxel",
    partialConfig
      ? partial("BL_WORKSPACE with BL_API_KEY or BL_CLIENT_CREDENTIALS")
      : missing("BL_WORKSPACE with BL_API_KEY or BL_CLIENT_CREDENTIALS")
  );
};

const cloudflareRow = (context: Context): Row => {
  const worker = value("CLOUDFLARE_SANDBOX_WORKER_URL", context);
  const token = has("CLOUDFLARE_SANDBOX_TOKEN", context);
  const workflow = worker !== undefined && token;
  const workflowPartial = worker !== undefined || token;

  if (worker !== undefined && !validUrl(worker)) {
    return row(
      "cloudflare",
      "bun run verify:cloudflare",
      missing("CLOUDFLARE_SANDBOX_WORKER_URL must be an http or https URL")
    );
  }
  if (!workflow) {
    return row(
      "cloudflare",
      "bun run verify:cloudflare",
      workflowPartial
        ? partial("CLOUDFLARE_SANDBOX_WORKER_URL with CLOUDFLARE_SANDBOX_TOKEN")
        : missing("CLOUDFLARE_SANDBOX_WORKER_URL and CLOUDFLARE_SANDBOX_TOKEN")
    );
  }
  return row("cloudflare", "bun run verify:cloudflare", ready());
};

const cloudflareBridgeRow = (context: Context): Row => {
  const url = value("CLOUDFLARE_BRIDGE_URL", context);
  const token = has("CLOUDFLARE_BRIDGE_TOKEN", context);
  const readyBridge = url !== undefined && token;
  const partialBridge = url !== undefined || token;

  if (url !== undefined && !validUrl(url)) {
    return row(
      "cloudflare-bridge",
      "bun run verify:cloudflare:bridge",
      missing("CLOUDFLARE_BRIDGE_URL must be an http or https URL")
    );
  }
  if (!readyBridge) {
    return row(
      "cloudflare-bridge",
      "bun run verify:cloudflare:bridge",
      partialBridge
        ? partial("CLOUDFLARE_BRIDGE_URL with CLOUDFLARE_BRIDGE_TOKEN")
        : missing("CLOUDFLARE_BRIDGE_URL and CLOUDFLARE_BRIDGE_TOKEN")
    );
  }
  return row("cloudflare-bridge", "bun run verify:cloudflare:bridge", ready());
};

const daytonaRow = (context: Context): Row =>
  row(
    "daytona",
    "bun run verify:daytona",
    has("DAYTONA_API_KEY", context) ? ready() : missing("DAYTONA_API_KEY")
  );

const modalRow = (context: Context): Row => {
  const modalTokens = all(["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"], context);
  const modalPartial = any(["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"], context);
  const config = modalConfig(context);
  if (modalTokens) {
    return row("modal", "bun run verify:modal", ready());
  }
  if (config) {
    return row(
      "modal",
      "bun run verify:modal",
      ready("ready from modal cli config")
    );
  }
  return row(
    "modal",
    "bun run verify:modal",
    modalPartial
      ? partial("MODAL_TOKEN_ID with MODAL_TOKEN_SECRET or modal cli config")
      : missing("MODAL_TOKEN_ID with MODAL_TOKEN_SECRET or modal cli config")
  );
};

const vercelRow = (context: Context): Row => {
  const token = all(
    ["VERCEL_TOKEN", "VERCEL_TEAM_ID", "VERCEL_PROJECT_ID"],
    context
  );
  const tokenPartial = any(
    ["VERCEL_TOKEN", "VERCEL_TEAM_ID", "VERCEL_PROJECT_ID"],
    context
  );
  if (token) {
    return row("vercel", "bun run verify:vercel", ready());
  }
  if (tokenPartial) {
    return row(
      "vercel",
      "bun run verify:vercel",
      partial("VERCEL_TOKEN with VERCEL_TEAM_ID and VERCEL_PROJECT_ID")
    );
  }
  const oidcToken = value("VERCEL_OIDC_TOKEN", context);
  if (oidcToken !== undefined) {
    return row(
      "vercel",
      "bun run verify:vercel",
      oidc(oidcToken, current(context).now)
    );
  }
  return row(
    "vercel",
    "bun run verify:vercel",
    missing(
      "VERCEL_OIDC_TOKEN or VERCEL_TOKEN with VERCEL_TEAM_ID and VERCEL_PROJECT_ID"
    )
  );
};

const allRows = (context: Context): readonly Row[] => [
  blaxelRow(context),
  cloudflareRow(context),
  complete(
    "codesandbox",
    "bun run verify:codesandbox",
    ["CSB_API_KEY"],
    has("CSB_API_KEY", context)
  ),
  daytonaRow(context),
  complete(
    "e2b",
    "bun run verify:e2b",
    ["E2B_API_KEY", "E2B_ACCESS_TOKEN"],
    any(["E2B_API_KEY", "E2B_ACCESS_TOKEN"], context)
  ),
  modalRow(context),
  vercelRow(context),
];

const knownRows = (context: Context): readonly Row[] => [
  ...allRows(context),
  cloudflareBridgeRow(context),
];

export const knownProviders = (): readonly string[] =>
  knownRows({}).map((entry) => entry.provider);

export const credentialRows = (
  context: Context = {},
  providers: readonly string[] = []
): readonly Row[] => {
  const currentRows = [
    ...allRows(context),
    ...(providers.includes("cloudflare-bridge")
      ? [cloudflareBridgeRow(context)]
      : []),
  ];
  if (providers.length === 0) {
    return currentRows;
  }

  const requested = new Set(providers);
  return currentRows.filter((entry) => requested.has(entry.provider));
};

const pad = (input: string, size: number): string => input.padEnd(size, " ");

export const formatRows = (rows: readonly Row[]): string => {
  const widths = {
    command: Math.max(
      "command".length,
      ...rows.map((entry) => entry.command.length)
    ),
    provider: Math.max(
      "provider".length,
      ...rows.map((entry) => entry.provider.length)
    ),
    status: Math.max(
      "status".length,
      ...rows.map((entry) => entry.status.length)
    ),
  };
  const lines = [
    `${pad("provider", widths.provider)}  ${pad("status", widths.status)}  ${pad("command", widths.command)}  details`,
  ];
  for (const entry of rows) {
    lines.push(
      `${pad(entry.provider, widths.provider)}  ${pad(entry.status, widths.status)}  ${pad(entry.command, widths.command)}  ${entry.details}`
    );
  }

  const readyCount = rows.filter((entry) => entry.status === "ready").length;
  const partialCount = rows.filter(
    (entry) => entry.status === "partial"
  ).length;
  const missingCount = rows.filter(
    (entry) => entry.status === "missing"
  ).length;

  lines.push("");
  lines.push(
    `${readyCount} ready, ${partialCount} partial, ${missingCount} missing`
  );
  lines.push("no secret values were printed");
  return lines.join("\n");
};

if (import.meta.main) {
  const providers = process.argv.slice(2);
  const filtered = credentialRows({}, providers);
  const known = new Set(knownProviders());
  const unknown = providers.filter((provider) => !known.has(provider));

  if (unknown.length > 0) {
    console.error(`unknown provider: ${unknown.join(", ")}`);
    process.exit(1);
  }

  console.log(formatRows(filtered));

  if (filtered.some((entry) => entry.status !== "ready")) {
    process.exit(1);
  }
}
