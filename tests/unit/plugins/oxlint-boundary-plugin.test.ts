import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import plugin from "../../../plugins/oxlint-boundary-plugin";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const options = {
  root: ROOT,
  exempt: ["src/types/worker-configuration.d.ts"],
  importExempt: ["src/types/api.d.ts"],
  allowedServerTypes: ["src/types/api"],
};

interface ReportDescriptor {
  messageId: string;
  data: Record<string, string>;
}

type Visitor = (node: { type: string; source?: unknown }) => void;

function messagesFor(relative: string, code: string): string[] {
  const reports: ReportDescriptor[] = [];
  const context = {
    filename: path.join(ROOT, relative),
    cwd: ROOT,
    options: [options],
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
    for (const match of code.matchAll(/(?:\bfrom\s*|\bimport\s*)["'](?<specifier>[^"']+)["']/gu)) {
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

const SERVER = "server/app";
const CLIENT = "events/admin/ui/catalog/AdminCatalog";

describe("boundary/scopes", () => {
  describe("valid", () => {
    test("file with a marker and no imports", () => {
      expect(
        messagesFor(
          "src/shared/utils/placeholder.ts",
          "// @boundary shared\nexport const a = 1;\n",
        ),
      ).toEqual([]);
    });

    test("server file importing shared", () => {
      expect(
        messagesFor(
          "src/server/placeholder.ts",
          '// @boundary server\nimport { a } from "~/shared/utils/format";\n',
        ),
      ).toEqual([]);
    });

    test("client file importing allowed server types", () => {
      expect(
        messagesFor(
          "src/shared/client/placeholder.ts",
          '// @boundary client\nimport type { Api } from "~/types/api";\n',
        ),
      ).toEqual([]);
    });

    test("exempt file needs no marker", () => {
      expect(messagesFor("src/types/worker-configuration.d.ts", "export {};\n")).toEqual([]);
    });

    test("import-exempt file keeps its marker but skips imports", () => {
      expect(
        messagesFor("src/types/api.d.ts", '// @boundary shared\nimport "~/server/app";\n'),
      ).toEqual([]);
    });
  });

  describe("invalid", () => {
    test("missing marker", () => {
      expect(messagesFor("src/shared/utils/placeholder.ts", "export const a = 1;\n")).toEqual([
        "src/shared/utils/placeholder.ts is missing a valid // @boundary marker",
      ]);
    });

    test("client imports server", () => {
      expect(
        messagesFor(
          "src/shared/client/placeholder.ts",
          `// @boundary client\nimport { a } from "~/${SERVER}";\n`,
        ),
      ).toEqual([`src/shared/client/placeholder.ts (client) imports ~/${SERVER} (server)`]);
    });

    test("server imports client", () => {
      expect(
        messagesFor(
          "src/server/placeholder.ts",
          `// @boundary server\nimport { b } from "~/${CLIENT}";\n`,
        ),
      ).toEqual([`src/server/placeholder.ts (server) imports ~/${CLIENT} (client)`]);
    });

    test("shared imports client", () => {
      expect(
        messagesFor(
          "src/shared/utils/placeholder.ts",
          `// @boundary shared\nimport { b } from "~/${CLIENT}";\n`,
        ),
      ).toEqual([`src/shared/utils/placeholder.ts (shared) imports ~/${CLIENT} (client)`]);
    });

    test("shared re-exports server", () => {
      expect(
        messagesFor(
          "src/shared/utils/placeholder.ts",
          `// @boundary shared\nexport { a } from "~/${SERVER}";\n`,
        ),
      ).toEqual([`src/shared/utils/placeholder.ts (shared) imports ~/${SERVER} (server)`]);
    });
  });
});
