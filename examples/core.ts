import type {
  Adapter,
  Capabilities,
  Capability,
  Cause,
  Code,
  Entry,
  Exec,
  Files,
  Input,
  Mode,
  Options,
  Port,
  Ports,
  Process,
  Result,
  Running,
  Sandbox,
  SandboxRuntimeFiles,
  SandboxRuntimeProcess,
  SandboxRuntime,
  Snapshot,
  Snapshots,
  Spawn,
  Timer,
  Url,
} from "@sandbox-sdk/core";
import { duration, fromSandboxRuntime, port } from "@sandbox-sdk/core";

export type CoreTypes = Readonly<{
  adapter: Adapter;
  capabilities: Capabilities;
  capability: Capability;
  cause: Cause;
  code: Code;
  entry: Entry;
  exec: Exec;
  files: Files;
  input: Input;
  mode: Mode;
  options: Options;
  port: Port;
  ports: Ports;
  process: Process;
  result: Result;
  running: Running;
  sandbox: Sandbox;
  runtimeFiles: SandboxRuntimeFiles;
  runtimeProcess: SandboxRuntimeProcess;
  runtimeSandbox: SandboxRuntime;
  snapshot: Snapshot;
  snapshots: Snapshots;
  spawn: Spawn;
  timer: Timer;
  url: Url;
}>;

export const capabilities = {
  files: true,
  processExec: true,
  processSpawn: "combined",
  snapshotCreate: "filesystem",
  snapshotRestore: "filesystem",
} satisfies Capabilities;

export const validated = {
  port: port(3000),
  timeout: duration(30_000),
};

export const readStream = async (files: Files): Promise<string> =>
  new Response(await files.stream("/workspace/readme.md")).text();

export const liftRuntime = <Raw>(sandbox: SandboxRuntime<Raw>): Sandbox<Raw> =>
  fromSandboxRuntime(sandbox);
