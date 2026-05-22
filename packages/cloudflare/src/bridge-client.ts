import { bytes, sandboxError } from "@sandbox-sdk/core";
import type { Capabilities, Input } from "@sandbox-sdk/core";

export type Fetch = typeof fetch;

type Environment = typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

type BridgeError = Readonly<{
  code?: string;
  error?: string;
}>;

type CreateResponse = Readonly<{
  id: string;
}>;

type RunningResponse = Readonly<{
  running: boolean;
}>;

type SessionResponse = Readonly<{
  id: string;
}>;

/** generic JSON object returned by bridge utility routes */
export type CloudflareBridgeJson = Readonly<Record<string, unknown>>;

export type CloudflareBridgeRaw = Readonly<{
  create(): Promise<Readonly<{ id: string }>>;
  delete(id: string): Promise<void>;
  fetch: typeof fetch;
  health(): Promise<CloudflareBridgeJson>;
  hydrate(id: string, archive: Input): Promise<void>;
  mount(id: string, input: Mount): Promise<void>;
  openapi(): Promise<CloudflareBridgeJson>;
  pool: Readonly<{
    prime(): Promise<void>;
    shutdownPrewarmed(): Promise<void>;
    stats(): Promise<CloudflareBridgeJson>;
  }>;
  persist(id: string, options?: Persist): Promise<Uint8Array>;
  pty(id: string, options?: Pty): PtyConnection;
  request(path: string, init?: RequestInit): Promise<Response>;
  running(id: string): Promise<boolean>;
  session: Readonly<{
    create(id: string, options?: Session): Promise<Readonly<{ id: string }>>;
    delete(id: string, session: string): Promise<void>;
  }>;
  unmount(id: string, mountPath: string): Promise<void>;
  url: string;
}>;

/** Cloudflare Sandbox bridge adapter configuration */
export type CloudflareBridge = Readonly<{
  /**
   * deployed bridge base URL
   *
   * falls back to `SANDBOX_API_URL`
   */
  url?: string;
  /**
   * bearer token for the bridge
   *
   * falls back to `SANDBOX_API_KEY`
   */
  token?: string;
  /**
   * default sandbox working directory
   *
   * @default "/workspace"
   */
  cwd?: string;
  /** custom fetch implementation for tests or non-standard runtimes */
  fetch?: typeof fetch;
  /** stable sandbox id used when create input omits id */
  id?: string;
}>;

/** connection details for the bridge PTY WebSocket route */
export type PtyConnection = Readonly<{
  /** headers to pass when the WebSocket client supports custom headers */
  headers: Readonly<Record<string, string>>;
  /** WebSocket URL for `/v1/sandbox/:id/pty` */
  url: string;
}>;

/** options for `sandbox.raw.persist()` */
export type Persist = Readonly<{
  /** workspace-relative paths to exclude from the tar archive */
  excludes?: readonly string[];
}>;

/** options for creating a bridge execution session */
export type Session = Readonly<{
  /** custom session id */
  id?: string;
  /** initial working directory */
  cwd?: string;
  /** session-scoped environment variables */
  env?: Readonly<Record<string, string>>;
}>;

/** options for mounting an object-storage bucket through the bridge */
export type Mount = Readonly<{
  /** bucket name or Worker R2 binding name */
  bucket: string;
  /** absolute mount path inside the sandbox */
  mountPath: string;
  /** bridge mount options forwarded to Cloudflare */
  options?: Readonly<Record<string, unknown>>;
}>;

/** options for the raw bridge PTY WebSocket route */
export type Pty = Readonly<{
  /** terminal width in columns */
  cols?: number;
  /** terminal height in rows */
  rows?: number;
  /** bridge session id used to scope the terminal */
  session?: string;
  /** shell binary to run inside the terminal */
  shell?: string;
}>;

export const provider = "cloudflare";

export const bridgeCapabilities: Capabilities = {
  environment: "separate",
  files: true,
  ports: false,
  process: true,
  processExec: true,
  processSpawn: false,
  raw: {
    backup: true,
    buckets: "configured",
    lifecycle: "dynamic",
    pty: true,
    sessions: true,
  },
  snapshotCreate: false,
  snapshotRestore: false,
  snapshots: false,
  streaming: "separate",
};

export const absolute = (cwd: string, path = cwd): string => {
  const value = path.startsWith("/") ? path : `${cwd}/${path}`;
  const output = new URL(value, "file:///").pathname;
  if (output === "/" || !output.startsWith("/workspace")) {
    throw sandboxError(
      provider,
      "Cloudflare bridge paths must stay under /workspace",
      "path_escape"
    );
  }
  return output;
};

export const route = (path: string): string =>
  path.replace(/^\/+/u, "").split("/").map(encodeURIComponent).join("/");

export const fail = async (
  response: Response,
  feature: string
): Promise<never> => {
  let error: BridgeError | undefined;
  try {
    error = (await response.json()) as BridgeError;
  } catch {
    error = { error: await response.text() };
  }

  throw sandboxError(
    provider,
    `${feature} failed: ${error.error || response.statusText}`,
    response.status === 404 ? "not_found" : "provider",
    error
  );
};

const env = (name: string): string | undefined =>
  (globalThis as Environment).process?.env?.[name]?.trim() || undefined;

const trim = (value: string): string => value.replace(/\/+$/u, "");

export const bridgeBody = (input: Uint8Array | string): ArrayBuffer | string =>
  typeof input === "string" ? input : Uint8Array.from(input).buffer;

const bridgeUrl = (value: string): string => {
  try {
    const url = new URL(trim(value));
    if (url.protocol === "http:" || url.protocol === "https:") {
      return trim(url.toString());
    }
  } catch {
    throw sandboxError(
      provider,
      "Cloudflare bridge URL must be a valid http or https URL",
      "configuration"
    );
  }

  throw sandboxError(
    provider,
    "Cloudflare bridge URL must be a valid http or https URL",
    "configuration"
  );
};

const ptyNumber = (
  name: string,
  value: number | undefined
): string | undefined => {
  if (value === undefined) {
    return;
  }
  if (Number.isInteger(value) && value > 0) {
    return String(value);
  }
  throw sandboxError(
    provider,
    `Cloudflare bridge pty ${name} must be a positive integer`,
    "configuration"
  );
};

const validate = (
  options: CloudflareBridge
): { token?: string; url: string } => {
  const url = options.url?.trim() || env("SANDBOX_API_URL");
  if (url === undefined) {
    throw sandboxError(
      provider,
      "Cloudflare bridge URL missing. Pass url to cloudflareBridge() or set SANDBOX_API_URL.",
      "configuration"
    );
  }

  const token = options.token?.trim() || env("SANDBOX_API_KEY");
  const value = bridgeUrl(url);
  return token === undefined ? { url: value } : { token, url: value };
};

const pty = (
  url: string,
  token: string | undefined,
  id: string,
  options: Pty = {}
): PtyConnection => {
  const target = new URL(`${url}/v1/sandbox/${encodeURIComponent(id)}/pty`);
  target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
  const cols = ptyNumber("cols", options.cols);
  if (cols !== undefined) {
    target.searchParams.set("cols", cols);
  }
  const rows = ptyNumber("rows", options.rows);
  if (rows !== undefined) {
    target.searchParams.set("rows", rows);
  }
  if (options.shell !== undefined) {
    target.searchParams.set("shell", options.shell);
  }
  if (options.session !== undefined) {
    target.searchParams.set("session", options.session);
  }

  return {
    headers: token === undefined ? {} : { Authorization: `Bearer ${token}` },
    url: target.toString(),
  };
};

const parseJson = async <Value>(response: Response): Promise<Value> => {
  try {
    return (await response.json()) as Value;
  } catch (error) {
    throw sandboxError(
      provider,
      "Cloudflare bridge returned invalid JSON",
      "provider",
      error
    );
  }
};

const bridgeRequest = (
  url: string,
  token: string | undefined,
  bridgeFetch: Fetch,
  path: string,
  init: RequestInit = {}
): Promise<Response> => {
  const headers = new Headers(init.headers);
  if (token !== undefined) {
    headers.set("authorization", `Bearer ${token}`);
  }

  return bridgeFetch(`${url}${path}`, {
    ...init,
    headers,
  });
};

export const bridge = (options: CloudflareBridge): CloudflareBridgeRaw => {
  const { token, url } = validate(options);
  const bridgeFetch = options.fetch ?? fetch;
  const request = (path: string, init?: RequestInit): Promise<Response> =>
    bridgeRequest(url, token, bridgeFetch, path, init);

  return {
    create: async () => {
      const response = await request("/v1/sandbox", { method: "POST" });
      if (!response.ok) {
        await fail(response, "bridge create");
      }
      return parseJson<CreateResponse>(response);
    },
    delete: async (id) => {
      const response = await request(`/v1/sandbox/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 404) {
        await fail(response, "bridge delete");
      }
    },
    fetch: bridgeFetch,
    health: async () => {
      const response = await request("/health");
      if (!response.ok) {
        await fail(response, "bridge health");
      }
      return parseJson<CloudflareBridgeJson>(response);
    },
    hydrate: async (id, archive) => {
      const input = await bytes(archive);
      const response = await request(
        `/v1/sandbox/${encodeURIComponent(id)}/hydrate`,
        {
          body: bridgeBody(input),
          method: "POST",
        }
      );
      if (!response.ok) {
        await fail(response, "bridge hydrate");
      }
    },
    mount: async (id, input) => {
      const response = await request(
        `/v1/sandbox/${encodeURIComponent(id)}/mount`,
        {
          body: JSON.stringify(input),
          headers: { "content-type": "application/json" },
          method: "POST",
        }
      );
      if (!response.ok) {
        await fail(response, "bridge mount");
      }
    },
    openapi: async () => {
      const response = await request("/v1/openapi.json");
      if (!response.ok) {
        await fail(response, "bridge openapi");
      }
      return parseJson<CloudflareBridgeJson>(response);
    },
    persist: async (id, input) => {
      const search = new URLSearchParams();
      if (input?.excludes !== undefined) {
        search.set("excludes", input.excludes.join(","));
      }
      const suffix = search.size > 0 ? `?${search}` : "";
      const response = await request(
        `/v1/sandbox/${encodeURIComponent(id)}/persist${suffix}`,
        { method: "POST" }
      );
      if (!response.ok) {
        await fail(response, "bridge persist");
      }
      return new Uint8Array(await response.arrayBuffer());
    },
    pool: {
      prime: async () => {
        const response = await request("/v1/pool/prime", { method: "POST" });
        if (!response.ok) {
          await fail(response, "bridge pool prime");
        }
      },
      shutdownPrewarmed: async () => {
        const response = await request("/v1/pool/shutdown-prewarmed", {
          method: "POST",
        });
        if (!response.ok) {
          await fail(response, "bridge pool shutdown");
        }
      },
      stats: async () => {
        const response = await request("/v1/pool/stats");
        if (!response.ok) {
          await fail(response, "bridge pool stats");
        }
        return parseJson<CloudflareBridgeJson>(response);
      },
    },
    pty: (id, input) => pty(url, token, id, input),
    request,
    running: async (id) => {
      const response = await request(
        `/v1/sandbox/${encodeURIComponent(id)}/running`
      );
      if (!response.ok) {
        await fail(response, "bridge running");
      }
      const payload = await parseJson<RunningResponse>(response);
      return payload.running;
    },
    session: {
      create: async (id, input = {}) => {
        const response = await request(
          `/v1/sandbox/${encodeURIComponent(id)}/session`,
          {
            body: JSON.stringify(input),
            headers: { "content-type": "application/json" },
            method: "POST",
          }
        );
        if (!response.ok) {
          await fail(response, "bridge session create");
        }
        return parseJson<SessionResponse>(response);
      },
      delete: async (id, session) => {
        const response = await request(
          `/v1/sandbox/${encodeURIComponent(id)}/session/${encodeURIComponent(session)}`,
          { method: "DELETE" }
        );
        if (!response.ok && response.status !== 404) {
          await fail(response, "bridge session delete");
        }
      },
    },
    unmount: async (id, mountPath) => {
      const response = await request(
        `/v1/sandbox/${encodeURIComponent(id)}/unmount`,
        {
          body: JSON.stringify({ mountPath }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }
      );
      if (!response.ok) {
        await fail(response, "bridge unmount");
      }
    },
    url,
  };
};
