import type { Kit, Name, Tool, Tools } from "./index.js";

export type Entry = Readonly<{
  name: Name;
  tool: Tool<unknown, unknown>;
}>;

export type Approval = boolean | Readonly<Partial<Record<Name, boolean>>>;

export const names = ["read", "write", "list", "exec", "preview"] as const;

export const entries = (tools: Tools): Entry[] =>
  names.flatMap((name) => {
    const value = tools[name];
    return value === undefined
      ? []
      : [
          {
            name,
            tool: value as Tool<unknown, unknown>,
          },
        ];
  });

export const approval = (name: Name, value: Approval | undefined): boolean => {
  if (typeof value === "boolean") {
    return value && (name === "exec" || name === "preview" || name === "write");
  }
  if (value?.[name] !== undefined) {
    return value[name];
  }
  return name === "exec" || name === "preview" || name === "write";
};

export const instructions = (kit: Kit): string => kit.description;

export const json = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);

export const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
