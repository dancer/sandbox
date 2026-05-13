import { CodeTabs } from "@/components/code-tabs";

const ADAPTERS = [
  {
    config: `local()`,
    id: "local",
    import: `import { local } from "@sandbox-sdk/local";`,
    label: "Local",
  },
  {
    config: `blaxel({ image: "blaxel/base-image:latest" })`,
    id: "blaxel",
    import: `import { blaxel } from "@sandbox-sdk/blaxel";`,
    label: "Blaxel",
  },
  {
    config: `cloudflare({ binding: env.SANDBOX })`,
    id: "cloudflare",
    import: `import { cloudflare } from "@sandbox-sdk/cloudflare";`,
    label: "Cloudflare",
  },
  {
    config: `codesandbox({ template: "template-sandbox-id" })`,
    id: "codesandbox",
    import: `import { codesandbox } from "@sandbox-sdk/codesandbox";`,
    label: "CodeSandbox",
  },
  {
    config: `daytona({ image: "ubuntu:22.04" })`,
    id: "daytona",
    import: `import { daytona } from "@sandbox-sdk/daytona";`,
    label: "Daytona",
  },
  {
    config: `e2b({ template: "base" })`,
    id: "e2b",
    import: `import { e2b } from "@sandbox-sdk/e2b";`,
    label: "E2B",
  },
  {
    config: `modal({ image: "alpine:3.21" })`,
    id: "modal",
    import: `import { modal } from "@sandbox-sdk/modal";`,
    label: "Modal",
  },
  {
    config: `vercel({ runtime: "node22" })`,
    id: "vercel",
    import: `import { vercel } from "@sandbox-sdk/vercel";`,
    label: "Vercel",
  },
] as const;

const buildCode = (adapter: (typeof ADAPTERS)[number]) =>
  `import { withSandbox } from "@sandbox-sdk/core";
${adapter.import}

await withSandbox(
  {
    adapter: ${adapter.config},
    cwd: "/workspace",
  },
  async (sandbox) => {
    await sandbox.files.write("/workspace/main.ts", "console.log('hello')");

    const result = await sandbox.process.shell("bun /workspace/main.ts");

    console.log(result.stdout);
  }
);`;

const TABS = ADAPTERS.map((adapter) => ({
  code: buildCode(adapter),
  id: adapter.id,
  label: adapter.label,
  lang: "tsx" as const,
}));

export const Demo = () => <CodeTabs tabs={TABS} />;
