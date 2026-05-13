import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import * as ts from "typescript";

type Entry = Readonly<{
  docs: string;
  kind: "classes" | "exports" | "functions" | "types";
  name: string;
  signature: string;
}>;

type Package = Readonly<{
  description: string;
  file: string;
  name: string;
}>;

const root = process.cwd();
const output = join(root, "docs/api.md");
const printer = ts.createPrinter({
  newLine: ts.NewLineKind.LineFeed,
  removeComments: false,
});
const folders = [
  "core",
  "local",
  "ai",
  "blaxel",
  "cloudflare",
  "codesandbox",
  "daytona",
  "e2b",
  "modal",
  "vercel",
] as const;

const read = async (folder: string): Promise<Package> => {
  const directory = join(root, "packages", folder);
  const text = await readFile(join(directory, "package.json"), "utf-8");
  const json = JSON.parse(text) as { description?: string; name: string };
  return {
    description: json.description ?? "",
    file: join(directory, "dist/index.d.ts"),
    name: json.name,
  };
};

const clean = (value: string): string =>
  value
    .split("\n")
    .map((line) => line.replace(/^\s*\* ?/u, "").trimEnd())
    .join("\n")
    .trim();

const docs = (source: ts.SourceFile, node: ts.Node): string => {
  const comments = ts
    .getJSDocCommentsAndTags(node)
    .filter(ts.isJSDoc)
    .map((item) =>
      typeof item.comment === "string" ? item.comment.trim() : ""
    )
    .filter(Boolean)
    .join("\n\n");

  if (comments.length > 0) {
    return comments;
  }

  const match = /^\s*\/\*\*([\s\S]*?)\*\//u.exec(node.getFullText(source));
  return match?.[1] === undefined ? "" : clean(match[1]);
};

const code = (source: ts.SourceFile, node: ts.Node): string =>
  printer
    .printNode(ts.EmitHint.Unspecified, node, source)
    .replace(/^\/\*\*[\s\S]*?\*\/\s*/u, "")
    .replace(/\n\/\/# sourceMappingURL=.*$/u, "")
    .replaceAll("\r\n", "\n")
    .trim();

const exported = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  Boolean(
    ts
      .getModifiers(node)
      ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );

const variable = (
  source: ts.SourceFile,
  statement: ts.VariableStatement
): Entry[] =>
  statement.declarationList.declarations.map((item) => ({
    docs: docs(source, statement),
    kind: "functions",
    name: ts.isIdentifier(item.name) ? item.name.text : "value",
    signature: code(source, statement),
  }));

const name = (node: ts.Node): string => {
  if (
    (ts.isClassDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node)) &&
    node.name
  ) {
    return node.name.text;
  }
  return "export";
};

const entry = (source: ts.SourceFile, statement: ts.Statement): Entry[] => {
  if (ts.isExportDeclaration(statement)) {
    const empty =
      statement.moduleSpecifier === undefined &&
      (statement.exportClause === undefined ||
        (ts.isNamedExports(statement.exportClause) &&
          statement.exportClause.elements.length === 0));

    if (empty) {
      return [];
    }
    return [
      {
        docs: "",
        kind: "exports",
        name: "re-export",
        signature: code(source, statement),
      },
    ];
  }
  if (!exported(statement)) {
    return [];
  }
  if (ts.isVariableStatement(statement)) {
    return variable(source, statement);
  }
  if (ts.isClassDeclaration(statement)) {
    return [
      {
        docs: docs(source, statement),
        kind: "classes",
        name: name(statement),
        signature: code(source, statement),
      },
    ];
  }
  if (
    ts.isFunctionDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement)
  ) {
    return [
      {
        docs: docs(source, statement),
        kind: ts.isFunctionDeclaration(statement) ? "functions" : "types",
        name: name(statement),
        signature: code(source, statement),
      },
    ];
  }
  return [];
};

const parse = async (item: Package): Promise<Entry[]> => {
  const text = await readFile(item.file, "utf-8");
  const source = ts.createSourceFile(item.file, text, ts.ScriptTarget.Latest);
  return source.statements.flatMap((statement) => entry(source, statement));
};

const title = (value: Entry["kind"]): string => {
  if (value === "types") {
    return "types";
  }
  if (value === "functions") {
    return "functions";
  }
  if (value === "classes") {
    return "classes";
  }
  return "re-exports";
};

const render = (entries: readonly Entry[]): string =>
  (["types", "classes", "functions", "exports"] as const)
    .map((kind) => {
      const items = entries.filter((item) => item.kind === kind);
      if (items.length === 0) {
        return "";
      }
      return [
        `### ${title(kind)}`,
        ...items.map((item) =>
          [
            `#### \`${item.name}\``,
            item.docs,
            ["```ts", item.signature, "```"].join("\n"),
          ]
            .filter(Boolean)
            .join("\n\n")
        ),
      ].join("\n\n");
    })
    .filter(Boolean)
    .join("\n\n");

const main = async (): Promise<void> => {
  const packages = await Promise.all(folders.map(read));
  const sections = await Promise.all(
    packages.map(async (item) => {
      const entries = await parse(item);
      return [`## ${item.name}`, item.description, render(entries)].join(
        "\n\n"
      );
    })
  );
  const text = [
    "# API Reference",
    "Generated from package declaration output",
    "Run `bun run docs:api` after changing public exports",
    ...sections,
    "",
  ].join("\n\n");

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, text);
};

await main();
