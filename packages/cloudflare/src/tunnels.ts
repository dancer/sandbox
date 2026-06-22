import { port, sandboxError } from "@sandbox-sdk/core";

const provider = "cloudflare";

const pattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

/** named Cloudflare tunnel labels keyed by sandbox port. labels must be unique within one sandbox */
export type CloudflareTunnelNames = Readonly<Record<number, string>>;

export const tunnelName = (value: string): string => {
  if (pattern.test(value)) {
    return value;
  }
  throw sandboxError(
    provider,
    "Cloudflare named tunnel labels must use 1 to 63 lowercase letters, digits, and internal hyphens",
    "configuration"
  );
};

export const tunnelPort = (value: number): number => {
  const target = port(value, provider);
  if (target >= 1024 && target !== 3000) {
    return target;
  }
  throw sandboxError(
    provider,
    "Cloudflare tunnel ports must be integers from 1024 to 65535, excluding 3000",
    target === 3000 ? "unsupported" : "configuration"
  );
};

const mappedPort = (value: string): number => {
  const target = tunnelPort(Number(value));
  if (String(target) === value) {
    return target;
  }
  throw sandboxError(
    provider,
    "Cloudflare named tunnel ports must use canonical integer keys",
    "configuration"
  );
};

const collision = (name: string, current: number, next: number): never => {
  throw sandboxError(
    provider,
    `Cloudflare named tunnel ${name} is already assigned to port ${current}. Configure a distinct label for port ${next}.`,
    "configuration"
  );
};

export const validateTunnels = (
  tunnel: string | undefined,
  tunnels: CloudflareTunnelNames | undefined
): void => {
  if (tunnel !== undefined) {
    tunnelName(tunnel);
  }
  const labels = new Map<string, number>();
  for (const [value, name] of Object.entries(tunnels ?? {})) {
    const target = mappedPort(value);
    const label = tunnelName(name);
    const current = labels.get(label);
    if (current !== undefined && current !== target) {
      collision(label, current, target);
    }
    labels.set(label, target);
  }
};

export const namedTunnel = (
  tunnel: string | undefined,
  tunnels: CloudflareTunnelNames | undefined,
  target: number,
  labels: Map<string, number>
): Readonly<{ name: string }> | undefined => {
  const name = tunnels?.[target] ?? tunnel;
  if (name === undefined) {
    return;
  }
  const current = labels.get(name);
  if (current !== undefined && current !== target) {
    collision(name, current, target);
  }
  labels.set(name, target);
  return { name };
};
