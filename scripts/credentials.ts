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

const envValue = (name: string): string | undefined => {
  const current = process.env[name]?.trim();
  return current === "" ? undefined : current;
};

const has = (name: string): boolean => envValue(name) !== undefined;

const all = (names: readonly string[]): boolean => names.every(has);

const any = (names: readonly string[]): boolean => names.some(has);

const modalConfig = (): boolean =>
  has("MODAL_CONFIG_PATH") || existsSync(join(homedir(), ".modal.toml"));

const blaxelConfig = (): boolean =>
  existsSync(join(homedir(), ".blaxel", "config.yaml"));

const complete = (
  provider: string,
  command: string,
  requirements: readonly string[],
  ready: boolean
): Row => ({
  command,
  details: ready ? "ready" : requirements.join(" or "),
  provider,
  status: ready ? "ready" : "missing",
});

const blaxelRow = (): Row => {
  const explicit =
    has("BL_WORKSPACE") && any(["BL_API_KEY", "BL_CLIENT_CREDENTIALS"]);
  const config = blaxelConfig();
  const partial = any(["BL_WORKSPACE", "BL_API_KEY", "BL_CLIENT_CREDENTIALS"]);
  if (explicit) {
    return {
      command: "bun run verify:blaxel",
      details: "ready",
      provider: "blaxel",
      status: "ready",
    };
  }
  if (config) {
    return {
      command: "bun run verify:blaxel",
      details: "ready from blaxel cli config",
      provider: "blaxel",
      status: "ready",
    };
  }
  return {
    command: "bun run verify:blaxel",
    details: "BL_WORKSPACE with BL_API_KEY or BL_CLIENT_CREDENTIALS",
    provider: "blaxel",
    status: partial ? "partial" : "missing",
  };
};

const cloudflareRow = (): Row => {
  const cloudflareWorkflow = all([
    "CLOUDFLARE_SANDBOX_WORKER_URL",
    "CLOUDFLARE_SANDBOX_TOKEN",
  ]);
  const cloudflarePorts = has("CLOUDFLARE_SANDBOX_PREVIEW_HOST");
  if (cloudflareWorkflow && cloudflarePorts) {
    return {
      command: "bun run verify:cloudflare",
      details: "ready",
      provider: "cloudflare",
      status: "ready",
    };
  }
  if (cloudflareWorkflow) {
    return {
      command: "bun run verify:cloudflare",
      details: "workflow ready, add CLOUDFLARE_SANDBOX_PREVIEW_HOST for ports",
      provider: "cloudflare",
      status: "partial",
    };
  }
  return {
    command: "bun run verify:cloudflare",
    details: "CLOUDFLARE_SANDBOX_WORKER_URL and CLOUDFLARE_SANDBOX_TOKEN",
    provider: "cloudflare",
    status: "missing",
  };
};

const daytonaRow = (): Row => {
  if (has("DAYTONA_API_KEY")) {
    return {
      command: "bun run verify:daytona",
      details: "ready",
      provider: "daytona",
      status: "ready",
    };
  }
  return {
    command: "bun run verify:daytona",
    details: "DAYTONA_API_KEY",
    provider: "daytona",
    status: "missing",
  };
};

const modalRow = (): Row => {
  const modalTokens = all(["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"]);
  const modalPartial = any(["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"]);
  const config = modalConfig();
  if (modalTokens) {
    return {
      command: "bun run verify:modal",
      details: "ready",
      provider: "modal",
      status: "ready",
    };
  }
  if (config) {
    return {
      command: "bun run verify:modal",
      details: "ready from modal cli config",
      provider: "modal",
      status: "ready",
    };
  }
  return {
    command: "bun run verify:modal",
    details: "MODAL_TOKEN_ID with MODAL_TOKEN_SECRET or modal cli config",
    provider: "modal",
    status: modalPartial ? "partial" : "missing",
  };
};

const vercelRow = (): Row => {
  const oidc = has("VERCEL_OIDC_TOKEN");
  const token = all(["VERCEL_TOKEN", "VERCEL_TEAM_ID", "VERCEL_PROJECT_ID"]);
  const partial = any(["VERCEL_TOKEN", "VERCEL_TEAM_ID", "VERCEL_PROJECT_ID"]);
  if (oidc || token) {
    return {
      command: "bun run verify:vercel",
      details: "ready",
      provider: "vercel",
      status: "ready",
    };
  }
  return {
    command: "bun run verify:vercel",
    details:
      "VERCEL_OIDC_TOKEN or VERCEL_TOKEN with VERCEL_TEAM_ID and VERCEL_PROJECT_ID",
    provider: "vercel",
    status: partial ? "partial" : "missing",
  };
};

const credentialRows = (): readonly Row[] => [
  blaxelRow(),
  cloudflareRow(),
  complete(
    "codesandbox",
    "bun run verify:codesandbox",
    ["CSB_API_KEY"],
    has("CSB_API_KEY")
  ),
  daytonaRow(),
  complete(
    "e2b",
    "bun run verify:e2b",
    ["E2B_API_KEY", "E2B_ACCESS_TOKEN"],
    any(["E2B_API_KEY", "E2B_ACCESS_TOKEN"])
  ),
  modalRow(),
  vercelRow(),
];

const pad = (input: string, size: number): string => input.padEnd(size, " ");

const rows = credentialRows();
const widths = {
  command: Math.max("command".length, ...rows.map((row) => row.command.length)),
  provider: Math.max(
    "provider".length,
    ...rows.map((row) => row.provider.length)
  ),
  status: Math.max("status".length, ...rows.map((row) => row.status.length)),
};

console.log(
  `${pad("provider", widths.provider)}  ${pad("status", widths.status)}  ${pad("command", widths.command)}  details`
);

for (const row of rows) {
  console.log(
    `${pad(row.provider, widths.provider)}  ${pad(row.status, widths.status)}  ${pad(row.command, widths.command)}  ${row.details}`
  );
}

const ready = rows.filter((row) => row.status === "ready").length;
const partial = rows.filter((row) => row.status === "partial").length;
const missing = rows.filter((row) => row.status === "missing").length;

console.log("");
console.log(`${ready} ready, ${partial} partial, ${missing} missing`);
console.log("no secret values were printed");
