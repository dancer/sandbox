import type {
  AisdkOptions,
  BinaryFileWrite,
  Command,
  CommandResult,
  Context,
  Exec as AiExec,
  ExecResult,
  File,
  FileWrite,
  JsonSchema,
  Kit,
  ListResult,
  Name,
  NetworkSandboxSession,
  Options as AiOptions,
  Path,
  Policy,
  Preview,
  PreviewResult,
  SandboxBackend,
  SandboxProcess,
  SandboxSession,
  Schema,
  TextFile,
  TextFileWrite,
  TextResult,
  Tool,
  Tools,
  Write,
  WriteResult,
} from "@sandbox-sdk/ai";
import type {
  ClaudeOptions,
  ClaudeResult,
  ClaudeTool,
  ClaudeTools,
  ToolAnnotations,
} from "@sandbox-sdk/ai/claude";
import type {
  OpenAI,
  OpenAIOptions,
  OpenAITools,
} from "@sandbox-sdk/ai/openai";
import type {
  Blaxel,
  BlaxelRaw,
  SandboxLifecycle,
  SandboxUpdateNetwork,
} from "@sandbox-sdk/blaxel";
import type {
  Cloudflare,
  CloudflareBinding,
  CloudflareBridge,
  CloudflareBridgeFetch,
  CloudflareBridgeJson,
  CloudflareBridgeMount,
  CloudflareBridgePersist,
  CloudflareBridgePty,
  CloudflareBridgePtyConnection,
  CloudflareBridgeRaw,
  CloudflareBridgeSession,
  CloudflareBridgeTunnel,
  CloudflareBridgeTunnelOptions,
  CloudflareRaw,
  CloudflareSandbox,
} from "@sandbox-sdk/cloudflare";
import type { CodeSandbox, CodeSandboxRaw } from "@sandbox-sdk/codesandbox";
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
  PreviewOptions,
  Process,
  RawCapability,
  Result,
  Running,
  Sandbox,
  SandboxRuntime,
  SandboxRuntimeFiles,
  SandboxRuntimePorts,
  SandboxRuntimeProcess,
  SandboxRuntimePreview,
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
import type {
  Fork,
  KeepLastSnapshots,
  Resources,
  Runtime,
  Source,
  Vercel,
  VercelCommandOutput,
  VercelFetch,
  VercelInvalidRequestProxyHandler,
  VercelNetworkPolicy,
  VercelNetworkPolicyKeyValueMatcher,
  VercelNetworkPolicyMatch,
  VercelNetworkPolicyMatcher,
  VercelNetworkPolicyRule,
  VercelNetworkTransformer,
  VercelProxyHandler,
  VercelProxyMeta,
  VercelRaw,
  VercelSnapshotTreeNodeData,
  SerializedVercelCommand,
  SerializedVercelCommandFinished,
  SerializedVercelSandbox,
  SerializedVercelSnapshot,
} from "@sandbox-sdk/vercel";

export type EntrypointTypes = Readonly<{
  adapter: Adapter;
  aiBinaryFileWrite: BinaryFileWrite;
  aiCommand: Command;
  aiCommandResult: CommandResult;
  aiContext: Context;
  aiExec: AiExec;
  aiExecResult: ExecResult;
  aiFile: File;
  aiFileWrite: FileWrite;
  aiJsonSchema: JsonSchema;
  aiKit: Kit;
  aiListResult: ListResult;
  aiName: Name;
  aiNetworkSandboxSession: NetworkSandboxSession;
  aiOptions: AiOptions;
  aiPath: Path;
  aiPolicy: Policy<Path>;
  aiPreview: Preview;
  aiPreviewResult: PreviewResult;
  aiSandboxBackend: SandboxBackend;
  aiSandboxProcess: SandboxProcess;
  aiSandboxSession: SandboxSession;
  aiSchema: Schema;
  aiTextFile: TextFile;
  aiTextFileWrite: TextFileWrite;
  aiTextResult: TextResult;
  aiTool: Tool<Path, TextResult>;
  aiTools: Tools;
  aiWrite: Write;
  aiWriteResult: WriteResult;
  aisdk: AisdkOptions;
  blaxel: Blaxel;
  blaxelRaw: BlaxelRaw;
  blaxelSandboxLifecycle: SandboxLifecycle;
  blaxelSandboxUpdateNetwork: SandboxUpdateNetwork;
  capabilities: Capabilities;
  capability: Capability;
  capabilityModes: CapabilityModes;
  cause: Cause;
  claudeOptions: ClaudeOptions;
  claudeResult: ClaudeResult;
  claudeTool: ClaudeTool;
  claudeToolAnnotations: ToolAnnotations;
  claudeTools: ClaudeTools;
  cloudflare: Cloudflare;
  cloudflareBinding: CloudflareBinding;
  cloudflareBridge: CloudflareBridge;
  cloudflareBridgeFetch: CloudflareBridgeFetch;
  cloudflareBridgeJson: CloudflareBridgeJson;
  cloudflareBridgeMount: CloudflareBridgeMount;
  cloudflareBridgePersist: CloudflareBridgePersist;
  cloudflareBridgePty: CloudflareBridgePty;
  cloudflareBridgePtyConnection: CloudflareBridgePtyConnection;
  cloudflareBridgeRaw: CloudflareBridgeRaw;
  cloudflareBridgeSession: CloudflareBridgeSession;
  cloudflareBridgeTunnel: CloudflareBridgeTunnel;
  cloudflareBridgeTunnelOptions: CloudflareBridgeTunnelOptions;
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
  previewOptions: PreviewOptions;
  process: Process;
  rawCapability: RawCapability;
  result: Result;
  running: Running;
  sandbox: Sandbox;
  runtimeFiles: SandboxRuntimeFiles;
  runtimePorts: SandboxRuntimePorts;
  runtimeProcess: SandboxRuntimeProcess;
  runtimeSandbox: SandboxRuntime;
  runtimePreview: SandboxRuntimePreview;
  snapshot: Snapshot;
  snapshots: Snapshots;
  spawn: Spawn;
  timer: Timer;
  url: Url;
  vercel: Vercel;
  vercelCommandOutput: VercelCommandOutput;
  vercelFetch: VercelFetch;
  vercelFork: Fork;
  vercelInvalidRequestProxyHandler: VercelInvalidRequestProxyHandler;
  vercelKeepLastSnapshots: KeepLastSnapshots;
  vercelNetworkPolicy: VercelNetworkPolicy;
  vercelNetworkPolicyKeyValueMatcher: VercelNetworkPolicyKeyValueMatcher;
  vercelNetworkPolicyMatch: VercelNetworkPolicyMatch;
  vercelNetworkPolicyMatcher: VercelNetworkPolicyMatcher;
  vercelNetworkPolicyRule: VercelNetworkPolicyRule;
  vercelNetworkTransformer: VercelNetworkTransformer;
  vercelProxyHandler: VercelProxyHandler;
  vercelProxyMeta: VercelProxyMeta;
  vercelRaw: VercelRaw;
  vercelResources: Resources;
  vercelRuntime: Runtime;
  vercelSerializedCommand: SerializedVercelCommand;
  vercelSerializedCommandFinished: SerializedVercelCommandFinished;
  vercelSerializedSandbox: SerializedVercelSandbox;
  vercelSerializedSnapshot: SerializedVercelSnapshot;
  vercelSnapshotTreeNodeData: VercelSnapshotTreeNodeData;
  vercelSource: Source;
}>;
