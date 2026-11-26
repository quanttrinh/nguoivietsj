// @boundary shared
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { generateI18n, i18nIntegration, type I18nOptions } from "../../../plugins/i18n";

const translations = {
  en: {
    shared: { loading: "Loading…", emailLabel: "Email" },
    engineAdmin: { title: "Event administration", meta: { subtitle: "Subtitle" } },
    engineApiMessages: {
      event_not_found: "Event not found.",
      bad_request: "Bad request.",
    },
  },
  fr: {
    shared: { loading: "Chargement…", emailLabel: "Courriel" },
    engineAdmin: { title: "Administration des événements", meta: { subtitle: "Sous-titre" } },
    engineApiMessages: {
      event_not_found: "Événement introuvable.",
      bad_request: "Requête invalide.",
    },
  },
  vi: {
    shared: { loading: "Đang tải…", emailLabel: "Email" },
    engineAdmin: { title: "Quản lý sự kiện", meta: { subtitle: "Phụ đề" } },
    engineApiMessages: {
      event_not_found: "Không tìm thấy sự kiện.",
      bad_request: "Yêu cầu không hợp lệ.",
    },
  },
} as const;

let tempRoot: string | undefined;

/** Build a self-contained fixture; nothing is read from the repo's src/ or translations/. */
function setup(): I18nOptions {
  const root = mkdtempSync(path.join(tmpdir(), "i18n-generator-"));
  tempRoot = root;

  mkdirSync(path.join(root, "translations"), { recursive: true });
  mkdirSync(path.join(root, "src", "ui"), { recursive: true });

  for (const [locale, content] of Object.entries(translations)) {
    writeFileSync(
      path.join(root, "translations", `${locale}.json`),
      JSON.stringify(content, null, 2),
      "utf8",
    );
  }

  writeFileSync(
    path.join(root, "src", "ui", "FakeIsland.tsx"),
    [
      "export default function FakeIsland(labels: any) {",
      "  return <div>{labels.engineAdmin.title} {labels.shared.loading}</div>;",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );

  return {
    locales: ["en", "fr", "vi"],
    defaultLocale: "en",
    localeNames: { en: "English", fr: "Français", vi: "Tiếng Việt" },
    translationsDir: path.join(root, "translations"),
    client: {
      sourceDir: path.join(root, "src"),
      outDir: path.join(root, "src", "generated", "client"),
    },
    server: { outDir: path.join(root, "src", "generated", "server") },
  };
}

afterEach(() => {
  if (tempRoot !== undefined) {
    rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

describe("generateI18n", () => {
  test("emits a shared type module and one plain-data module per unit", async () => {
    const options = setup();
    await generateI18n(options);

    const typesFile = path.join(path.dirname(options.client.outDir), "i18n-types.ts");
    const clientModule = path.join(options.client.outDir, "FakeIsland.ts");
    const serverModule = path.join(options.server.outDir, "engineApiMessages.ts");

    expect(existsSync(typesFile)).toBe(true);
    expect(existsSync(clientModule)).toBe(true);
    expect(existsSync(serverModule)).toBe(true);

    const types = readFileSync(typesFile, "utf8");
    expect(types).toContain("export const defaultMessages = {");
    expect(types).toContain('"event_not_found": "Event not found."');
    expect(types).toContain("} as const;");
    expect(types).toContain("export type Messages = typeof defaultMessages;");
    expect(types).toContain("export type Namespace = keyof Messages;");
    expect(types).toContain("export type KeyOf<N extends Namespace> = keyof Messages[N];");
    expect(types).toContain('export type Locale = "en" | "fr" | "vi";');

    const client = readFileSync(clientModule, "utf8");
    expect(client).toContain('import type { Locale } from "~/shared/i18n";');
    expect(client).toContain("export function localized(locale: Locale): Labels {");
    expect(client).toContain("export type FakeIslandLabels = Labels;");
    for (const locale of options.locales) {
      expect(client).toContain(`case ${JSON.stringify(locale)}:`);
    }
    for (const value of [
      "Event administration",
      "Administration des événements",
      "Quản lý sự kiện",
      "Loading…",
      "Chargement…",
      "Đang tải…",
    ]) {
      expect(client).toContain(value);
    }
    // Only the two tracked paths are emitted, not the whole namespaces.
    expect(client).not.toContain("emailLabel");
    expect(client).not.toContain("subtitle");

    const server = readFileSync(serverModule, "utf8");
    expect(server).toContain("export function localized(locale: Locale): Labels {");
    expect(server).toContain("export type EngineApiMessagesLabels = Labels;");
    for (const value of [
      "Event not found.",
      "Événement introuvable.",
      "Không tìm thấy sự kiện.",
      "Bad request.",
      "Requête invalide.",
      "Yêu cầu không hợp lệ.",
    ]) {
      expect(server).toContain(value);
    }
    expect(server).toContain('"event_not_found"');
    expect(server).toContain('"bad_request"');
  });

  test("rejects locale files whose structure differs from the default locale", async () => {
    const options = setup();
    const fr = { ...translations.fr, engineAdmin: { title: translations.fr.engineAdmin.title } };
    writeFileSync(
      path.join(options.translationsDir, "fr.json"),
      JSON.stringify(fr, null, 2),
      "utf8",
    );

    await expect(generateI18n(options)).rejects.toThrow(/missing key/u);
  });

  test("exposes the Astro integration hook", () => {
    const options = setup();
    const integration = i18nIntegration(options);

    expect(integration.name).toBe("i18n");
    expect("astro:config:setup" in integration.hooks).toBe(true);
  });
});
