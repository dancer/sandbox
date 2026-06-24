import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import * as ts from "typescript";

type Entry = Readonly<{
  docs: Documentation;
  kind: "classes" | "exports" | "functions" | "types" | "values";
  members: readonly string[];
  name: string;
  signature: string;
}>;

type Documentation = Readonly<{
  description: string;
  examples: readonly string[];
}>;

type Package = Readonly<{
  description: string;
  files: readonly PackageFile[];
  name: string;
}>;

type PackageFile = Readonly<{
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

const none: Documentation = { description: "", examples: [] };

const read = async (folder: string): Promise<Package> => {
  const directory = join(root, "packages", folder);
  const text = await readFile(join(directory, "package.json"), "utf-8");
  const json = JSON.parse(text) as {
    description?: string;
    exports?: Record<string, { types?: string }>;
    name: string;
  };
  const files = Object.entries(json.exports ?? {}).flatMap(([key, value]) => {
    if (value.types === undefined) {
      return [];
    }
    return [
      {
        file: join(directory, value.types),
        name: key === "." ? json.name : `${json.name}${key.slice(1)}`,
      },
    ];
  });
  return {
    description: json.description ?? "",
    files:
      files.length === 0
        ? [{ file: join(directory, "dist/index.d.ts"), name: json.name }]
        : files,
    name: json.name,
  };
};

const clean = (value: string): string =>
  value
    .split("\n")
    .map((line) => line.replace(/^\s*\* ?/u, "").trimEnd())
    .join("\n")
    .trim();

const docs = (source: ts.SourceFile, node: ts.Node): Documentation => {
  const match = /^\s*\/\*\*([\s\S]*?)\*\//u.exec(node.getFullText(source));
  if (match?.[1] === undefined) {
    return none;
  }

  const description: string[] = [];
  const examples: string[] = [];
  let example: string[] | undefined;
  const flush = (): void => {
    if (example === undefined) {
      return;
    }
    const value = example.join("\n").trim();
    if (value.length > 0) {
      examples.push(value);
    }
    example = undefined;
  };

  for (const line of clean(match[1]).split("\n")) {
    if (line.startsWith("@example")) {
      flush();
      example = [];
      const value = line.slice("@example".length).trim();
      if (value.length > 0) {
        example.push(value);
      }
      continue;
    }
    if (example !== undefined && line.startsWith("@")) {
      flush();
      description.push(line);
      continue;
    }
    if (example === undefined) {
      description.push(line);
    } else {
      example.push(line);
    }
  }
  flush();

  return { description: description.join("\n").trim(), examples };
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
    kind:
      item.type !== undefined && ts.isFunctionTypeNode(item.type)
        ? "functions"
        : "values",
    members: [],
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

const localFile = (
  source: ts.SourceFile,
  statement: ts.ExportDeclaration
): string | undefined => {
  if (
    !statement.moduleSpecifier ||
    !ts.isStringLiteral(statement.moduleSpecifier)
  ) {
    return undefined;
  }
  const value = statement.moduleSpecifier.text;
  if (!value.startsWith(".")) {
    return undefined;
  }
  return join(dirname(source.fileName), value.replace(/\.js$/u, ".d.ts"));
};

const localNames = (
  statement: ts.ExportDeclaration
): ReadonlySet<string> | undefined => {
  if (
    statement.exportClause === undefined ||
    !ts.isNamedExports(statement.exportClause)
  ) {
    return undefined;
  }
  return new Set(
    statement.exportClause.elements.map(
      (element) => element.propertyName?.text ?? element.name.text
    )
  );
};

const external = (statement: ts.ExportDeclaration): Entry[] => {
  if (
    statement.moduleSpecifier === undefined ||
    !ts.isStringLiteral(statement.moduleSpecifier) ||
    statement.exportClause === undefined ||
    !ts.isNamedExports(statement.exportClause)
  ) {
    return [];
  }
  const source = statement.moduleSpecifier.text;
  if (source.startsWith(".")) {
    return [];
  }
  return statement.exportClause.elements.map((element) => {
    const original = element.propertyName?.text ?? element.name.text;
    const value =
      original === element.name.text
        ? original
        : `${original} as ${element.name.text}`;
    const modifier = statement.isTypeOnly || element.isTypeOnly ? " type" : "";
    return {
      docs: {
        description: `re-exported from \`${source}\``,
        examples: [],
      },
      kind: "exports",
      members: [],
      name: element.name.text,
      signature: `export${modifier} { ${value} } from "${source}";`,
    };
  });
};

const parseFile = async (
  file: string,
  parseStatement: (
    source: ts.SourceFile,
    statement: ts.Statement
  ) => Promise<Entry[]>
): Promise<Entry[]> => {
  const text = await readFile(file, "utf-8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest);
  const entries = await Promise.all(
    source.statements.map((statement) => parseStatement(source, statement))
  );
  return entries.flat();
};

const members = (source: ts.SourceFile, statement: ts.Statement): string[] => {
  const owner = name(statement);
  const missing: string[] = [];
  const inspect = (node: ts.TypeNode): void => {
    if (ts.isArrayTypeNode(node)) {
      inspect(node.elementType);
      return;
    }
    if (ts.isParenthesizedTypeNode(node) || ts.isTypeOperatorNode(node)) {
      inspect(node.type);
      return;
    }
    if (ts.isTypeReferenceNode(node)) {
      for (const item of node.typeArguments ?? []) {
        inspect(item);
      }
      return;
    }
    if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
      for (const item of node.types) {
        inspect(item);
      }
      return;
    }
    if (!ts.isTypeLiteralNode(node)) {
      return;
    }
    for (const item of node.members) {
      if (!ts.isPropertySignature(item) && !ts.isMethodSignature(item)) {
        continue;
      }
      const value = item.name?.getText(source);
      if (
        value !== undefined &&
        !value.startsWith("__") &&
        docs(source, item).description === ""
      ) {
        missing.push(`${owner}.${value}`);
      }
      if (item.type !== undefined) {
        inspect(item.type);
      }
    }
  };

  if (ts.isTypeAliasDeclaration(statement)) {
    inspect(statement.type);
  }
  if (ts.isInterfaceDeclaration(statement)) {
    inspect(
      ts.factory.createTypeLiteralNode(
        statement.members.filter(
          (item): item is ts.TypeElement =>
            ts.isPropertySignature(item) || ts.isMethodSignature(item)
        )
      )
    );
  }
  if (ts.isClassDeclaration(statement)) {
    for (const item of statement.members) {
      if (
        (ts.isPropertyDeclaration(item) || ts.isMethodDeclaration(item)) &&
        item.name !== undefined &&
        !item.name.getText(source).startsWith("__") &&
        docs(source, item).description === ""
      ) {
        missing.push(`${owner}.${item.name.getText(source)}`);
      }
    }
  }
  return missing;
};

const entry = async (
  source: ts.SourceFile,
  statement: ts.Statement
): Promise<Entry[]> => {
  if (ts.isExportDeclaration(statement)) {
    const empty =
      statement.moduleSpecifier === undefined &&
      (statement.exportClause === undefined ||
        (ts.isNamedExports(statement.exportClause) &&
          statement.exportClause.elements.length === 0));

    if (empty) {
      return [];
    }
    const file = localFile(source, statement);
    const names = localNames(statement);
    if (file !== undefined && names !== undefined) {
      const entries = await parseFile(file, entry);
      const selected = entries.filter((item) => names.has(item.name));
      if (selected.length === names.size) {
        return selected;
      }
      throw new Error(
        `unable to resolve local API export from ${source.fileName}`
      );
    }
    return external(statement);
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
        members: members(source, statement),
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
        members: members(source, statement),
        name: name(statement),
        signature: code(source, statement),
      },
    ];
  }
  return [];
};

const parse = (item: PackageFile): Promise<Entry[]> =>
  parseFile(item.file, entry);

const title = (value: Entry["kind"]): string => {
  if (value === "types") {
    return "types";
  }
  if (value === "functions") {
    return "functions";
  }
  if (value === "values") {
    return "values";
  }
  if (value === "exports") {
    return "provider exports";
  }
  return "classes";
};

const validate = (packageName: string, entries: readonly Entry[]): void => {
  const missing = entries
    .filter((item) => item.kind !== "exports")
    .flatMap((item) => [
      ...(item.docs.description === "" ? [item.name] : []),
      ...item.members,
    ]);
  if (missing.length > 0) {
    throw new Error(
      `public API JSDoc missing from ${packageName}: ${missing.join(", ")}`
    );
  }
};

const render = (entries: readonly Entry[]): string =>
  (["types", "classes", "functions", "values", "exports"] as const)
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
            item.docs.description,
            ...item.docs.examples.map((example) =>
              ["**example**", "```ts", example, "```"].join("\n")
            ),
            ["```ts", item.signature, "```"].join("\n"),
          ]
            .filter(Boolean)
            .join("\n\n")
        ),
      ].join("\n\n");
    })
    .filter(Boolean)
    .join("\n\n");

export const generate = async (destination = output): Promise<void> => {
  const packages = await Promise.all(folders.map(read));
  const sections = await Promise.all(
    packages.flatMap((item) =>
      item.files.map(async (file) => {
        const entries = await parse(file);
        validate(file.name, entries);
        return [`## ${file.name}`, item.description, render(entries)].join(
          "\n\n"
        );
      })
    )
  );
  const text = [
    "# API Reference",
    "Generated from package declaration output",
    "Run `bun run docs:api` after changing public exports",
    ...sections,
    "",
  ].join("\n\n");

  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, text);
};

if (import.meta.main) {
  await generate();
}
