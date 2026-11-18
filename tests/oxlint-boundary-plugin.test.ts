import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import plugin from "../plugins/oxlint-boundary-plugin";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const options = {
  root: ROOT,
  serverSegments: ["server", "db", "services", "backfills"],
  clientSegments: ["ui", "client"],
  astroSegments: ["pages", "layouts"],
  exempt: ["src/types/worker-configuration.d.ts"],
  importExempt: ["src/types/api.d.ts"],
  allowedServerTypes: ["src/types/api"],
};

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*)["'](?<specifier>[^"']+)["']/gu;

interface ReportDescriptor {
  messageId: string;
  data: Record<string, string>;
}

type Visitor = (node: { type: string; source?: unknown }) => void;

function messagesFor(
  relative: string,
  code: string,
  overrides: Partial<typeof options> = {},
): string[] {
  const reports: ReportDescriptor[] = [];
  const context = {
    filename: path.join(ROOT, relative),
    cwd: ROOT,
    options: [{ ...options, ...overrides }],
    sourceCode: { getText: () => code },
    report: (report: ReportDescriptor) => reports.push(report),
  };
  const visitors: Partial<Record<string, Visitor>> = plugin.rules.scopes.create(context);
  const program = visitors.Program;
  const checkImport = visitors.ImportDeclaration;

  if (program !== undefined) {
    program({ type: "Program" });
  }

  if (checkImport !== undefined) {
    for (const match of code.matchAll(SPECIFIER)) {
      const specifier = match.groups?.specifier;

      if (specifier !== undefined) {
        checkImport({ type: "ImportDeclaration", source: { value: specifier } });
      }
    }
  }

  return reports.map(({ messageId, data }) => {
    const template = plugin.rules.scopes.meta.messages[messageId] ?? "";

    return template.replaceAll(/\{\{(?<key>\w+)\}\}/gu, (_, key: string) => data[key] ?? "");
  });
}

describe("boundary/scopes", () => {
  describe("valid", () => {
    test("shared file with a matching marker and no imports", () => {
      expect(
        messagesFor("src/shared/utils/a.ts", "// @boundary shared\nexport const a = 1;\n"),
      ).toEqual([]);
    });

    test("server file importing shared", () => {
      expect(
        messagesFor("src/db/a.ts", '// @boundary server\nimport { a } from "../shared/utils/a";\n'),
      ).toEqual([]);
    });

    test("client file importing allowed server types", () => {
      expect(
        messagesFor(
          "src/shared/client/a.ts",
          '// @boundary client\nimport type { Api } from "~/types/api";\n',
        ),
      ).toEqual([]);
    });

    test("exempt file needs no marker", () => {
      expect(messagesFor("src/types/worker-configuration.d.ts", "export {};\n")).toEqual([]);
    });

    test("import-exempt file keeps its marker but skips imports", () => {
      expect(
        messagesFor("src/types/api.d.ts", '// @boundary shared\nimport "~/db/app";\n'),
      ).toEqual([]);
    });

    test("scope segments come from options", () => {
      expect(
        messagesFor("src/api/a.ts", "// @boundary server\n", { serverSegments: ["api"] }),
      ).toEqual([]);
    });
  });

  describe("invalid", () => {
    test("missing marker", () => {
      expect(messagesFor("src/shared/utils/a.ts", "export const a = 1;\n")).toEqual([
        "src/shared/utils/a.ts is missing a valid // @boundary marker",
      ]);
    });

    test("marker does not match the path scope", () => {
      expect(messagesFor("src/shared/utils/a.ts", "// @boundary server\n")).toEqual([
        'src/shared/utils/a.ts marker is "server" but its path is "shared"',
      ]);
    });

    test("client imports server", () => {
      expect(
        messagesFor(
          "src/shared/client/a.ts",
          '// @boundary client\nimport type { User } from "~/db/app/schemas/auth-schema";\n',
        ),
      ).toEqual(["src/shared/client/a.ts (client) imports ~/db/app/schemas/auth-schema (server)"]);
    });

    test("server imports client", () => {
      expect(
        messagesFor(
          "src/db/a.ts",
          '// @boundary server\nimport { b } from "../shared/client/a";\n',
        ),
      ).toEqual(["src/db/a.ts (server) imports ../shared/client/a (client)"]);
    });

    test("shared imports client", () => {
      expect(
        messagesFor(
          "src/shared/utils/a.ts",
          '// @boundary shared\nimport { b } from "~/shared/client/a";\n',
        ),
      ).toEqual(["src/shared/utils/a.ts (shared) imports ~/shared/client/a (client)"]);
    });

    test("shared re-exports server", () => {
      expect(
        messagesFor(
          "src/shared/utils/a.ts",
          '// @boundary shared\nexport { a } from "~/db/app";\n',
        ),
      ).toEqual(["src/shared/utils/a.ts (shared) imports ~/db/app (server)"]);
    });
  });
});
