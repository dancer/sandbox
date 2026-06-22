import type {
  Config as BlaxelConfig,
  SandboxInstance,
  SandboxCreateConfiguration,
} from "@blaxel/core";

/**
 * native Blaxel sandbox exposed as `sandbox.raw`
 *
 * use this for provider-specific behavior that does not belong in the normalized contract
 */
export type BlaxelRaw = SandboxInstance;

/**
 * configure a Blaxel adapter
 *
 * explicit configuration takes precedence over environment values and provider credentials are never forwarded into the sandbox environment
 *
 * @example
 * blaxel({ workspace: "acme", apiKey: process.env.BL_API_KEY })
 */
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
    /** default environment variables for new sandboxes; rejects BL_API_KEY and BL_CLIENT_CREDENTIALS to prevent credential forwarding */
    env?: Readonly<Record<string, string>>;
    /** application-owned identifier stored with the new Blaxel sandbox and usable with `SandboxInstance.getByExternalId` */
    externalId?: string;
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
      | "externalId"
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
      | "volumes"
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
    /** blaxel volumes mounted into the sandbox at creation time */
    volumes?: SandboxCreateConfiguration["volumes"];
  }
>;
