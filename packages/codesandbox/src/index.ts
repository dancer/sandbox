import { dirname, join as joinPath } from "node:path/posix";

import { CodeSandbox as CodeSandboxClient } from "@codesandbox/sdk";
import {
  abort,
  bytes,
  command,
  duration,
  port,
  result,
  sandboxError,
  sandboxPath,
  timeout,
  unsupported,
} from "@sandbox-sdk/core";
import type {
  Adapter,
  Capabilities,
  Entry,
  Exec,
  Input,
  Port,
  Result,
  Running,
  Sandbox,
  Spawn,
} from "@sandbox-sdk/core";

import type {
  ClientOptions,
  CodeSandboxRaw,
  CreateOptions,
  LocalCreate,
  SandboxClient,
  SessionOptions,
} from "./types.js";

export type { CodeSandboxRaw } from "./types.js";

/**
 * CodeSandbox adapter configuration
 *
 * pass a native CodeSandbox client when reusing an existing client or custom fetch transport
 */
export type CodeSandbox = Readonly<{
  /** wakeup behavior for hibernated CodeSandbox VMs */
  automaticWakeupConfig?: CreateOptions["automaticWakeupConfig"];
  /** existing native CodeSandbox sdk client for dependency injection or custom fetch transport */
  client?: CodeSandboxRaw["sdk"];
  /** options forwarded to the codesandbox sdk constructor */
  clientOptions?: ClientOptions;
  /** default working directory for normalized file and process operations */
  cwd?: string;
  /** sandbox description shown in codesandbox */
  description?: string;
  /** default environment variables injected into the sdk session; rejects CSB_API_KEY to prevent credential forwarding */
  env?: Readonly<Record<string, string>>;
  /** country hint forwarded when starting the vm */
  ipcountry?: CreateOptions["ipcountry"];
  /** custom sandbox path inside the codesandbox workspace */
  path?: string;
  /** sandbox preview privacy for newly created sandboxes */
  privacy?: CreateOptions["privacy"];
  /** sdk session options forwarded to `sandbox.connect`; custom ids must be 20 characters or less */
  session?: Omit<SessionOptions, "env">;
  /**
   * lifecycle action used by `sandbox.stop`
   *
   * hibernate keeps a memory snapshot for resume. shutdown starts from a clean boot on the next resume, while delete permanently removes the sandbox
   */
  stop?: "delete" | "disconnect" | "hibernate" | "shutdown";
  /** codesandbox tags added when creating a sandbox */
  tags?: readonly string[];
  /**
   * template sandbox id used for new sandboxes
   *
   * create input template or snapshot overrides this default and creates a new sandbox instead of resuming one
   */
  template?: string;
  /** default idle hibernation timeout in milliseconds for new sandboxes, rounded up to a whole second */
  timeout?: number;
  /** sandbox title shown in codesandbox */
  title?: string;
  /** api token. falls back to CSB_API_KEY */
  token?: string;
  /** vm tier forwarded when starting the vm */
  vmTier?: CreateOptions["vmTier"];
}>;

const provider = "codesandbox";

const secrets = ["CSB_API_KEY"] as const;

const capabilities: Capabilities = {
  environment: true,
  files: true,
  ports: "dynamic",
  process: true,
  processExec: true,
  processSpawn: true,
  raw: {
    interpreter: true,
    lifecycle: true,
    previews: true,
    pty: true,
    resources: "dynamic",
    sessions: true,
    watching: true,
  },
  snapshotCreate: "memory",
  snapshotRestore: false,
  snapshotSource: "create-time",
  snapshots: false,
  streaming: "combined",
};

const noop = (): void => void 0;

const present = (value: string | undefined): value is string =>
  value !== undefined && value.length > 0;

const first = (
  ...values: readonly (string | undefined)[]
): string | undefined => values.find(present);

const env = (name: string): string | undefined =>
  (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env?.[name];

const assertSandboxEnv = (value: Readonly<Record<string, string>>): void => {
  const leaked = secrets.filter((name) => value[name] !== undefined);
  if (leaked.length === 0) {
    return;
  }
  throw sandboxError(
    provider,
    `CodeSandbox provider credentials cannot be forwarded into sandbox env: ${leaked.join(", ")}`,
    "configuration"
  );
};

const sandboxEnv = (
  options: CodeSandbox,
  input: NonNullable<Parameters<Adapter<CodeSandboxRaw>["create"]>[0]>
): Readonly<Record<string, string>> => {
  const value = { ...options.env, ...input.env };
  assertSandboxEnv(value);
  return value;
};

const validate = (options: CodeSandbox): void => {
  if (options.client) {
    return;
  }
  const token = first(options.token, env("CSB_API_KEY"));
  if (present(token)) {
    return;
  }
  throw sandboxError(
    provider,
    "CodeSandbox credentials missing. Set CSB_API_KEY or pass token to codesandbox().",
    "configuration"
  );
};

const validateSession = (options: CodeSandbox): void => {
  if (options.session?.id !== undefined && options.session.id.length > 20) {
    throw sandboxError(
      provider,
      "CodeSandbox session id must be 20 characters or less",
      "configuration"
    );
  }
};

const sdk = (options: CodeSandbox): CodeSandboxRaw["sdk"] =>
  options.client ??
  new CodeSandboxClient(options.token, options.clientOptions ?? {});

const createOptions = (
  options: CodeSandbox,
  input: NonNullable<Parameters<Adapter<CodeSandboxRaw>["create"]>[0]>
): LocalCreate => {
  const template = input.snapshot ?? input.template ?? options.template;
  const lifetime = duration(input.timeout ?? options.timeout, provider);
  return {
    ...(template === undefined ? {} : { id: template }),
    ...(options.automaticWakeupConfig === undefined
      ? {}
      : { automaticWakeupConfig: options.automaticWakeupConfig }),
    ...(options.privacy === undefined ? {} : { privacy: options.privacy }),
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.description === undefined
      ? {}
      : { description: options.description }),
    ...(options.tags === undefined ? {} : { tags: [...options.tags] }),
    ...(options.path === undefined ? {} : { path: options.path }),
    ...(options.ipcountry === undefined
      ? {}
      : { ipcountry: options.ipcountry }),
    ...(options.vmTier === undefined ? {} : { vmTier: options.vmTier }),
    ...(lifetime === undefined
      ? {}
      : {
          hibernationTimeoutSeconds: Math.max(1, Math.ceil(lifetime / 1000)),
        }),
  };
};

const session = (
  options: CodeSandbox,
  environment: Readonly<Record<string, string>>
): SessionOptions => ({
  ...options.session,
  ...(Object.keys(environment).length === 0 ? {} : { env: environment }),
});

const failure = (error: unknown): Result | undefined => {
  if (
    error instanceof Error &&
    "exitCode" in error &&
    "output" in error &&
    typeof error.exitCode === "number" &&
    typeof error.output === "string"
  ) {
    return result(error.exitCode, error.output, "");
  }
  return undefined;
};

const check = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    abort(provider, signal.reason);
  }
};

const readable = (value: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start: (controller) => {
      controller.enqueue(value);
      controller.close();
    },
  });

const rejectUnsupported = (feature: string): Promise<never> => {
  try {
    unsupported(provider, feature);
  } catch (error) {
    return Promise.reject(error);
  }
};

const inactive = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("is not active");

const missingPathError =
  /^(?:(?:ENOENT|null): (?:file|path) not found|\d+: Os \{ code: 2, kind: NotFound, message: "No such file or directory" \})$/iu;

const missing = (error: unknown): boolean =>
  error instanceof Error && missingPathError.test(error.message);

const url = (host: string): string =>
  host.startsWith("http://") || host.startsWith("https://")
    ? host
    : `https://${host}`;

const previewUrl = (
  raw: CodeSandboxRaw,
  value: number,
  protocol: NonNullable<Port["protocol"]> | undefined,
  token: string | undefined,
  fallback: string
): string => {
  if (protocol === "tcp") {
    unsupported(provider, "tcp previews");
  }
  if (token !== undefined) {
    if (raw.sdk.hosts === undefined) {
      unsupported(provider, "manual preview tokens");
    }
    return raw.sdk.hosts.getUrl(
      { sandboxId: raw.sandbox.id, token },
      value,
      protocol
    );
  }
  return raw.client.hosts === undefined
    ? url(fallback)
    : raw.client.hosts.getUrl(value, protocol);
};

const spawn = async (
  client: SandboxClient,
  cwd: string,
  line: string,
  options: Spawn
): Promise<Running> => {
  check(options.signal);
  try {
    const process = await client.commands.runBackground(line, {
      ...(options.cwd === undefined ? { cwd } : { cwd: options.cwd }),
      ...(options.env === undefined ? {} : { env: { ...options.env } }),
    });
    const encoder = new TextEncoder();
    let dispose = noop;
    const output = new ReadableStream<Uint8Array>({
      cancel() {
        dispose();
      },
      start(controller) {
        const listener = process.onOutput((value) => {
          controller.enqueue(encoder.encode(value));
        });
        const { dispose: finish } = listener;
        dispose = finish;
        void (async () => {
          try {
            const initial = await process.open();
            if (initial.length > 0) {
              controller.enqueue(encoder.encode(initial));
            }
            await process.waitUntilComplete();
            controller.close();
          } catch (error) {
            if (inactive(error)) {
              controller.close();
              return;
            }
            if (failure(error) !== undefined) {
              controller.close();
              return;
            }
            controller.error(error);
          }
        })();
      },
    });
    const final = (async (): Promise<Result> => {
      try {
        return result(0, await process.waitUntilComplete(), "");
      } catch (error) {
        const failed = failure(error);
        if (failed !== undefined) {
          return failed;
        }
        throw error;
      } finally {
        dispose();
      }
    })();

    const cancel = (): void => {
      void process.kill();
    };
    if (options.signal?.aborted) {
      cancel();
    } else {
      options.signal?.addEventListener("abort", cancel, { once: true });
    }
    const kill = async (): Promise<void> => {
      options.signal?.removeEventListener("abort", cancel);
      await process.kill();
    };

    return {
      id: process.name ?? process.command,
      kill,
      output,
      result: (async () => {
        try {
          return await final;
        } finally {
          options.signal?.removeEventListener("abort", cancel);
        }
      })(),
    };
  } catch (error) {
    if (options.signal?.aborted) {
      abort(provider, error);
    }
    throw sandboxError(provider, "Command failed", "process", error);
  }
};

const execute = async (
  client: SandboxClient,
  cwd: string,
  line: string,
  options: Exec
): Promise<Result> => {
  check(options.signal);
  if (options.signal !== undefined || options.timeout !== undefined) {
    const deadline = timeout(options.timeout, options.signal, provider);
    try {
      const run = {
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
        ...(options.env === undefined ? {} : { env: { ...options.env } }),
        ...(deadline.signal === undefined ? {} : { signal: deadline.signal }),
      };
      const running = await spawn(client, cwd, line, run);
      const output = await running.result;
      if (options.signal?.aborted) {
        abort(provider, options.signal.reason);
      }
      if (deadline.aborted()) {
        throw sandboxError(provider, "Command timed out", "timeout", output);
      }
      return output;
    } finally {
      deadline.clear();
    }
  }
  try {
    const stdout = await client.commands.run(line, {
      ...(options.cwd === undefined ? { cwd } : { cwd: options.cwd }),
      ...(options.env === undefined ? {} : { env: { ...options.env } }),
    });
    return result(0, stdout, "");
  } catch (error) {
    const output = failure(error);
    if (output !== undefined) {
      return output;
    }
    throw sandboxError(provider, "Command failed", "process", error);
  }
};

const shell = (
  client: SandboxClient,
  cwd: string,
  script: string,
  options: Exec
): Promise<Result> => execute(client, cwd, script, options);

const mkdir = async (client: SandboxClient, path: string): Promise<void> => {
  await client.fs.mkdir(path, true);
};

const write = async (
  client: SandboxClient,
  path: string,
  input: Input
): Promise<void> => {
  const value = await bytes(input);
  await mkdir(client, dirname(path));
  if (typeof value === "string") {
    await client.fs.writeTextFile(path, value);
    return;
  }
  await client.fs.writeFile(path, value);
};

const exists = async (
  client: SandboxClient,
  path: string
): Promise<boolean> => {
  try {
    await client.fs.stat(path);
    return true;
  } catch (error) {
    if (missing(error)) {
      return false;
    }
    throw error;
  }
};

const list = async (client: SandboxClient, path: string): Promise<Entry[]> => {
  const children = await client.fs.readdir(path);
  const entries = await Promise.all(
    children.map(async (entry): Promise<Entry> => {
      const next = joinPath(path, entry.name);
      const stat = await client.fs.stat(next);
      return {
        kind: entry.type,
        modified: new Date(stat.mtime),
        path: next,
        size: stat.size,
      };
    })
  );
  return entries.toSorted((left, right) => left.path.localeCompare(right.path));
};

const wrap = async <Value>(
  action: () => Promise<Value> | Value,
  feature: string
): Promise<Value> => {
  try {
    return await action();
  } catch (error) {
    throw sandboxError(provider, `${feature} failed`, "provider", error);
  }
};

const createSandbox = (
  raw: CodeSandboxRaw,
  cwd: string,
  stop: CodeSandbox["stop"]
): Sandbox<CodeSandboxRaw> => ({
  capabilities,
  cwd,
  files: {
    exists: (path) =>
      wrap(() => exists(raw.client, sandboxPath(cwd, path)), "exists"),
    list: (path = cwd) =>
      wrap(() => list(raw.client, sandboxPath(cwd, path)), "list"),
    mkdir: (path) =>
      wrap(() => mkdir(raw.client, sandboxPath(cwd, path)), "mkdir"),
    read: (path) =>
      wrap(() => raw.client.fs.readFile(sandboxPath(cwd, path)), "read"),
    remove: (path) =>
      wrap(() => raw.client.fs.remove(sandboxPath(cwd, path), true), "remove"),
    stream: async (path) =>
      readable(
        await wrap(
          () => raw.client.fs.readFile(sandboxPath(cwd, path)),
          "stream"
        )
      ),
    text: (path) =>
      wrap(() => raw.client.fs.readTextFile(sandboxPath(cwd, path)), "text"),
    write: (path, input) =>
      wrap(() => write(raw.client, sandboxPath(cwd, path), input), "write"),
  },
  id: raw.sandbox.id,
  ports: {
    expose: async (value, options = {}) => {
      const target = port(value, provider);
      if ("host" in options) {
        unsupported(provider, "custom preview hosts");
      }
      const preview = await wrap(
        () => raw.client.ports.waitForPort(target),
        "port exposure"
      );
      return {
        port: target,
        url: previewUrl(
          raw,
          target,
          options.protocol,
          options.token,
          preview.host
        ),
      };
    },
  },
  process: {
    exec: (executable, args = [], options = {}) =>
      execute(raw.client, cwd, command(executable, args), options),
    shell: (script, options = {}) => shell(raw.client, cwd, script, options),
    spawn: (executable, args = [], options = {}) =>
      spawn(raw.client, cwd, command(executable, args), options),
    spawnShell: (script, options = {}) =>
      spawn(raw.client, cwd, script, options),
  },
  provider,
  raw,
  snapshots: {
    create: async (name) => {
      await raw.sdk.sandboxes.hibernate(raw.sandbox.id);
      return { id: raw.sandbox.id, ...(name === undefined ? {} : { name }) };
    },
    restore: () => rejectUnsupported("in-place snapshot restore"),
  },
  stop: async () => {
    await wrap(() => raw.client.disconnect(), "disconnect");
    if (stop === "disconnect") {
      return;
    }
    if (stop === "delete") {
      await wrap(() => raw.sdk.sandboxes.delete(raw.sandbox.id), "stop");
      return;
    }
    if (stop === "hibernate") {
      await wrap(() => raw.sdk.sandboxes.hibernate(raw.sandbox.id), "stop");
      return;
    }
    await wrap(() => raw.sdk.sandboxes.shutdown(raw.sandbox.id), "stop");
  },
});

/**
 * create a CodeSandbox adapter with normalized sandbox operations
 *
 * create with id resumes an existing sandbox. create with template or snapshot starts a new sandbox from an existing sandbox id. normalized snapshot creation hibernates the source and returns its id for a later create
 */
export const codesandbox = (
  options: CodeSandbox = {}
): Adapter<CodeSandboxRaw> => ({
  capabilities,
  async create(input = {}) {
    validate(options);
    validateSession(options);
    const environment = sandboxEnv(options, input);
    const current = sdk(options);
    const sandbox =
      input.id === undefined
        ? await current.sandboxes.create(createOptions(options, input))
        : await current.sandboxes.resume(input.id);
    const client = await sandbox.connect(session(options, environment));
    const cwd = input.cwd ?? options.cwd ?? client.workspacePath;
    await wrap(() => mkdir(client, cwd), "mkdir");
    return createSandbox(
      { client, sandbox, sdk: current },
      cwd,
      options.stop ?? "shutdown"
    );
  },
  provider,
});
