import type { BlaxelRaw } from "@sandbox-sdk/blaxel";
import type { CloudflareRaw } from "@sandbox-sdk/cloudflare";
import type { CodeSandboxRaw } from "@sandbox-sdk/codesandbox";
import type { Sandbox } from "@sandbox-sdk/core";
import type { DaytonaRaw } from "@sandbox-sdk/daytona";
import type { E2BRaw } from "@sandbox-sdk/e2b";
import type { ModalRaw } from "@sandbox-sdk/modal";
import type { VercelRaw } from "@sandbox-sdk/vercel";

export const useVercelRaw = async (sandbox: Sandbox<VercelRaw>) => {
  await sandbox.raw.extendTimeout(300_000);
  await sandbox.raw.updateNetworkPolicy("deny-all");
  return sandbox.raw.domain(3000);
};

export const useCloudflareRaw = async (sandbox: Sandbox<CloudflareRaw>) => {
  const context = await sandbox.raw.createCodeContext({
    cwd: sandbox.cwd,
    language: "python",
  });
  return sandbox.raw.runCode("print('hello from cloudflare')", { context });
};

export const useE2BRaw = async (sandbox: Sandbox<E2BRaw>) => {
  const status = await sandbox.raw.git.status(sandbox.cwd);
  const download = await sandbox.raw.downloadUrl(`${sandbox.cwd}/artifact.txt`);
  return { download, status };
};

export const useDaytonaRaw = async (sandbox: Sandbox<DaytonaRaw>) => {
  const access = await sandbox.raw.createSshAccess(15);
  await sandbox.raw.updateNetworkSettings({ networkBlockAll: false });
  return access;
};

export const useModalRaw = async (sandbox: Sandbox<ModalRaw>) => {
  await sandbox.raw.setTags({ purpose: "advanced-example" });
  const credentials = await sandbox.raw.createConnectToken();
  const image = await sandbox.raw.snapshotDirectory("/tmp");
  return { credentials, image };
};

export const useBlaxelRaw = async (sandbox: Sandbox<BlaxelRaw>) => {
  const expiresAt = new Date(Date.now() + 60_000);
  const session = await sandbox.raw.sessions.create({ expiresAt });
  const previews = await sandbox.raw.previews.list();
  await sandbox.raw.sessions.delete(session.name);
  return previews;
};

export const useCodeSandboxRaw = async (sandbox: Sandbox<CodeSandboxRaw>) => {
  const port = await sandbox.raw.client.ports.waitForPort(3000);
  const command = await sandbox.raw.client.commands.runBackground("sleep 1", {
    cwd: sandbox.cwd,
  });
  await command.kill();
  return port;
};
