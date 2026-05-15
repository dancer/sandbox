import { dirname, join as joinPath } from "node:path/posix";

import { CodeSandbox as CodeSandboxClient } from "@codesandbox/sdk";
import {
  abort,
  bytes,
  command,
  error as sandboxError,
  result,
  timeout,
  unsupported,
} from "@sandbox-sdk/core";
import type {
  Adapter,
  Capabilities,
  Entry,
  Exec,
  Input,
  Result,
  Running,
  Sandbox,
  Spawn,
} from "@sandbox-sdk/core";

import type {
  ClientOptions,
  CreateOptions,
  LocalCreate,
  Raw,
  SandboxClient,
  Sdk,
  SessionOptions,
} from "./types.js";

/** codesandbox adapter configuration */
export type CodeSandbox = Readonly<{
  /** existing codesandbox sdk client for tests or custom transport */
  client?: Sdk;
  /** options forwarded to the codesandbox sdk constructor */
  clientOptions?: ClientOptions;
  /** default working directory for normalized file and process operations */
  cwd?: string;
  /** sandbox description shown in codesandbox */
  description?: string;
  /** default environment variables injected into the sdk session */
  env?: Readonly<Record<string, string>>;
  /** country hint forwarded when starting the vm */
  ipcountry?: CreateOptions["ipcountry"];
  /** custom sandbox path inside the codesandbox workspace */
  path?: string;
  /** sandbox preview privacy */
  privacy?: CreateOptions["privacy"];
  /** sdk session options forwarded to `sandbox.connect` */
  session?: Omit<SessionOptions, "env">;
  /** stop behavior used by `sandbox.stop` */
  stop?: "delete" | "disconnect" | "hibernate" | "shutdown";
  /** codesandbox tags added when creating a sandbox */
  tags?: readonly string[];
  /** template sandbox id used for new sandboxes */
  template?: string;
  /** sandbox title shown in codesandbox */
  title?: string;
  /** api token. falls back to CSB_API_KEY */
  token?: string;
  /** vm tier forwarded when starting the vm */
  vmTier?: CreateOptions["vmTier"];
}>;

const provider = "codesandbox";

const capabilities: Capabilities = {
  environment: true,
  files: true,
  git: true,
  network: true,
  ports: "dynamic",
  process: true,
  processExec: true,
  processSpawn: true,
  snapshotCreate: false,
  snapshotRestore: false,
  snapshotSource: false,
  snapshots: false,
  streaming: "combined",
};

const noop = (): void => void 0;

const present = (value: string | undefined): value is string =>
  value !== undefined && value.length > 0;

const env = (name: string): string | undefined => globalThis.process?.env[name];

const validate = (options: CodeSandbox): void => {
  if (options.client) {
    return;
  }
  const token = options.token ?? env("CSB_API_KEY");
  if (present(token)) {
    return;
  }
  throw sandboxError(
    provider,
    "CodeSandbox credentials missing. Set CSB_API_KEY or pass token to codesandbox().",
    "configuration"
  );
};

const sdk = (options: CodeSandbox): Sdk =>
  options.client ??
  (new CodeSandboxClient(options.token, options.clientOptions ?? {}) as Sdk);

const createOptions = (
  options: CodeSandbox,
  input: NonNullable<Parameters<Adapter<Raw>["create"]>[0]>
): LocalCreate => {
  const template = input.template ?? options.template;
  return {
    ...(template === undefined ? {} : { id: template }),
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
    ...(input.timeout === undefined
      ? {}
      : {
          hibernationTimeoutSeconds: Math.max(
            1,
            Math.ceil(input.timeout / 1000)
          ),
        }),
  };
};

const session = (
  options: CodeSandbox,
  input: NonNullable<Parameters<Adapter<Raw>["create"]>[0]>
): SessionOptions => {
  const values = { ...options.env, ...input.env };
  return {
    ...options.session,
    ...(Object.keys(values).length === 0 ? {} : { env: values }),
  };
};

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

const rejectUnsupported = (feature: string): Promise<never> => {
  try {
    unsupported(provider, feature);
  } catch (error) {
    return Promise.reject(error);
  }
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

    options.signal?.addEventListener(
      "abort",
      () => {
        void process.kill();
      },
      { once: true }
    );

    return {
      id: process.name ?? process.command,
      kill: () => process.kill(),
      output,
      result: final,
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
    const deadline = timeout(options.timeout, options.signal);
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
  } catch {
    return false;
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

const createSandbox = (
  raw: Raw,
  cwd: string,
  stop: CodeSandbox["stop"]
): Sandbox<Raw> => ({
  capabilities,
  cwd,
  files: {
    exists: (path) => exists(raw.client, path),
    list: (path = cwd) => list(raw.client, path),
    mkdir: (path) => mkdir(raw.client, path),
    read: (path) => raw.client.fs.readFile(path),
    remove: (path) => raw.client.fs.remove(path, true),
    text: (path) => raw.client.fs.readTextFile(path),
    write: (path, input) => write(raw.client, path, input),
  },
  id: raw.sandbox.id,
  ports: {
    expose: async (port, options = {}) => {
      if (options.host !== undefined || options.protocol === "tcp") {
        unsupported(provider, "custom preview hosts or tcp previews");
      }
      const preview = await raw.client.ports.waitForPort(port);
      return { port, url: preview.host };
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
    create: () => rejectUnsupported("normalized snapshot creation"),
    restore: () => rejectUnsupported("in-place snapshot restore"),
  },
  stop: async () => {
    await raw.client.disconnect();
    if (stop === "disconnect") {
      return;
    }
    if (stop === "delete") {
      await raw.sdk.sandboxes.delete(raw.sandbox.id);
      return;
    }
    if (stop === "hibernate") {
      await raw.sdk.sandboxes.hibernate(raw.sandbox.id);
      return;
    }
    await raw.sdk.sandboxes.shutdown(raw.sandbox.id);
  },
});

/** create a codesandbox adapter with normalized sandbox operations */
export const codesandbox = (options: CodeSandbox = {}): Adapter<Raw> => ({
  capabilities,
  async create(input = {}) {
    validate(options);
    if (input.snapshot) {
      unsupported(provider, "snapshot source");
    }
    const current = sdk(options);
    const sandbox =
      input.id === undefined
        ? await current.sandboxes.create(createOptions(options, input))
        : await current.sandboxes.resume(input.id);
    const client = await sandbox.connect(session(options, input));
    const cwd = input.cwd ?? options.cwd ?? client.workspacePath;
    await mkdir(client, cwd);
    return createSandbox(
      { client, sandbox, sdk: current },
      cwd,
      options.stop ?? "shutdown"
    );
  },
  provider,
});
