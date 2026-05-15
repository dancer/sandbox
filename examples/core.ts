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
  SimpleInsecureFiles,
  SimpleInsecureProcess,
  SimpleInsecureSandbox,
  Snapshot,
  Snapshots,
  Spawn,
  Timer,
  Url,
} from "@sandbox-sdk/core";

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
  simpleFiles: SimpleInsecureFiles;
  simpleProcess: SimpleInsecureProcess;
  simpleSandbox: SimpleInsecureSandbox;
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
