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
  await sandbox.files.write(`${sandbox.cwd}/artifact.txt`, "artifact");
  const status = await sandbox.raw.git.status(sandbox.cwd);
  const download = await sandbox.raw.downloadUrl(`${sandbox.cwd}/artifact.txt`);
  return { download, status };
};

export const useDaytonaRaw = async (sandbox: Sandbox<DaytonaRaw>) => {
  const session = `advanced-${Date.now()}`;
  await sandbox.raw.process.createSession(session);

  try {
    const command = await sandbox.raw.process.executeSessionCommand(session, {
      command: "printf raw-session",
      suppressInputEcho: true,
    });
    const logs = await sandbox.raw.process.getSessionCommandLogs(
      session,
      command.cmdId
    );
    const preview = await sandbox.raw.getSignedPreviewUrl(3000, 60);
    await sandbox.raw.expireSignedPreviewUrl(3000, preview.token);
    return { logs, preview: preview.url };
  } finally {
    await sandbox.raw.process.deleteSession(session);
  }
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
  const watcher = await sandbox.raw.client.fs.watch(sandbox.cwd, {
    recursive: true,
  });
  const terminal = await sandbox.raw.client.terminals.create("bash", {
    cwd: sandbox.cwd,
  });

  try {
    const javascript =
      await sandbox.raw.client.interpreters.javascript("'raw javascript'");
    await terminal.open();
    await terminal.run("printf 'raw terminal\\n'");
    const ports = (await sandbox.raw.client.ports.getAll?.()) ?? [];
    const tasks = await sandbox.raw.client.tasks.getAll();
    return { javascript, ports, tasks };
  } finally {
    watcher.dispose();
    await terminal.kill();
  }
};
