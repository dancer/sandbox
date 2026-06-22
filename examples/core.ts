import type {
  Adapter,
  Capabilities,
  Capability,
  CapabilityModes,
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

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;

type Assert<Value extends true> = Value;

export type CoreTypes = Readonly<{
  adapter: Adapter;
  capabilities: Capabilities;
  capability: Capability;
  capabilityModes: CapabilityModes;
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

export type CapabilityTypeChecks = Readonly<{
  fileStreaming: Assert<
    Equal<Extract<Capabilities["fileStreaming"], "disk">, never>
  >;
  processSpawn: Assert<
    Equal<Extract<Capabilities["processSpawn"], "combined">, never>
  >;
  streaming: Assert<
    Equal<Extract<Capabilities["streaming"], "combined">, "combined">
  >;
}>;

export const capabilities = {
  files: true,
  processExec: true,
  processSpawn: true,
  snapshotCreate: "filesystem",
  snapshotRestore: "filesystem",
  streaming: "combined",
} satisfies Capabilities;

export const validated = {
  port: port(3000),
  timeout: duration(30_000),
};

export const readStream = async (files: Files): Promise<string> =>
  new Response(await files.stream("/workspace/readme.md")).text();

export const liftRuntime = <Raw>(sandbox: SandboxRuntime<Raw>): Sandbox<Raw> =>
  fromSandboxRuntime(sandbox);
