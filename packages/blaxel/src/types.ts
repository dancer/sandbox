import type {
  Config as BlaxelConfig,
  SandboxInstance,
  SandboxCreateConfiguration,
} from "@blaxel/core";

/** native Blaxel sandbox object exposed as `sandbox.raw` */
export type BlaxelRaw = SandboxInstance;

/** blaxel adapter configuration */
export type Blaxel = Readonly<
  Pick<
    BlaxelConfig,
    | "apiKey"
    | "apikey"
    | "clientCredentials"
    | "disableH2"
    | "proxy"
    | "workspace"
  > & {
    /** default working directory for normalized file and process operations */
    cwd?: string;
    /** default environment variables applied when creating a sandbox */
    env?: Readonly<Record<string, string>>;
    /** sandbox expiration time forwarded to blaxel */
    expires?: Date;
    /** default blaxel image for new sandboxes */
    image?: string;
    /** default metadata labels attached to new sandboxes */
    labels?: Readonly<Record<string, string>>;
    /** blaxel lifecycle configuration forwarded to the native sdk */
    lifecycle?: SandboxCreateConfiguration["lifecycle"];
    /** blaxel memory allocation in mib */
    memory?: number;
    /** stable sandbox name for create or reconnect workflows */
    name?: string;
    /** blaxel network configuration forwarded to the native sdk */
    network?: SandboxCreateConfiguration["network"];
    /** extra blaxel sandbox create options */
    options?: Omit<
      SandboxCreateConfiguration,
      | "envs"
      | "expires"
      | "image"
      | "labels"
      | "lifecycle"
      | "memory"
      | "name"
      | "network"
      | "ports"
      | "region"
      | "ttl"
    >;
    /** ports declared at create time and later exposed through previews */
    ports?: readonly number[];
    /** blaxel region such as `us-pdx-1` */
    region?: string;
    /** verify basic filesystem access after creation */
    safe?: boolean;
    /** enable blaxel provider snapshot behavior for the sandbox runtime */
    snapshotEnabled?: boolean;
    /** sandbox ttl string forwarded to blaxel, such as `24h` */
    ttl?: string;
  }
>;
