import type {
  AgentSandbox,
  AisdkOptions,
  Command,
  CommandResult,
  Context,
  Exec as AiExec,
  ExecResult,
  JsonSchema,
  Kit,
  ListResult,
  Name,
  Options as AiOptions,
  Path,
  Policy,
  Preview,
  PreviewResult,
  Schema,
  SchemaResult,
  SandboxProcess,
  SandboxSession,
  TextResult,
  Tool,
  Tools,
  Write,
  WriteResult,
} from "@sandbox-sdk/ai";
import type {
  ClaudeResult,
  ClaudeTools,
  ClaudeTool,
} from "@sandbox-sdk/ai/claude";
import type {
  OpenAI,
  OpenAIOptions,
  OpenAITools,
} from "@sandbox-sdk/ai/openai";
import type { Blaxel, BlaxelRaw } from "@sandbox-sdk/blaxel";
import type {
  Cloudflare,
  CloudflareBinding,
  CloudflareRaw,
  CloudflareSandbox,
} from "@sandbox-sdk/cloudflare";
import type { CodeSandbox, CodeSandboxRaw } from "@sandbox-sdk/codesandbox";
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
import type { Daytona, DaytonaRaw } from "@sandbox-sdk/daytona";
import type { E2B, E2BRaw } from "@sandbox-sdk/e2b";
import type { Local } from "@sandbox-sdk/local";
import type { Modal, ModalRaw } from "@sandbox-sdk/modal";
import type { Vercel, VercelRaw } from "@sandbox-sdk/vercel";

export type EntrypointTypes = Readonly<{
  adapter: Adapter;
  agentSandbox: AgentSandbox;
  aiCommand: Command;
  aiCommandResult: CommandResult;
  aiContext: Context;
  aiExec: AiExec;
  aiExecResult: ExecResult;
  aiJsonSchema: JsonSchema;
  aiKit: Kit;
  aiListResult: ListResult;
  aiName: Name;
  aiOptions: AiOptions;
  aiPath: Path;
  aiPolicy: Policy<Path>;
  aiPreview: Preview;
  aiPreviewResult: PreviewResult;
  aiSchema: Schema;
  aiSchemaResult: SchemaResult;
  aiSandboxProcess: SandboxProcess;
  aiSandboxSession: SandboxSession;
  aisdk: AisdkOptions;
  aiTextResult: TextResult;
  aiTool: Tool<Path, TextResult>;
  aiTools: Tools;
  aiWrite: Write;
  aiWriteResult: WriteResult;
  blaxel: Blaxel;
  blaxelRaw: BlaxelRaw;
  capabilities: Capabilities;
  capability: Capability;
  cause: Cause;
  claudeResult: ClaudeResult;
  claudeTool: ClaudeTool;
  claudeTools: ClaudeTools;
  cloudflare: Cloudflare;
  cloudflareBinding: CloudflareBinding;
  cloudflareRaw: CloudflareRaw;
  cloudflareSandbox: CloudflareSandbox;
  code: Code;
  codesandbox: CodeSandbox;
  codesandboxRaw: CodeSandboxRaw;
  daytona: Daytona;
  daytonaRaw: DaytonaRaw;
  e2b: E2B;
  e2bRaw: E2BRaw;
  entry: Entry;
  exec: Exec;
  files: Files;
  input: Input;
  local: Local;
  modal: Modal;
  modalRaw: ModalRaw;
  mode: Mode;
  openai: OpenAI;
  openaiOptions: OpenAIOptions;
  openaiTools: OpenAITools;
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
  vercel: Vercel;
  vercelRaw: VercelRaw;
}>;
