import { isRecord } from "~/shared/utils/records";

import type { JsonRecord } from "./types";

export function asRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

export function contactKeyForRef(ref: string): "email" | "phone" | "mail" | null {
  if (ref === "system.contacts.email") {
    return "email";
  }

  if (ref === "system.contacts.phone") {
    return "phone";
  }

  if (ref === "system.contacts.mail") {
    return "mail";
  }

  return null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function fieldLabelObject(schema: JsonRecord, ref: string): Record<string, string> | null {
  if (ref.startsWith("custom.")) {
    const key = ref.slice("custom.".length);
    const field = asArray(schema.customFields)
      .map((item) => asRecord(item))
      .find((item) => item?.key === key);
    return asRecord(field?.label) as Record<string, string> | null;
  }

  if (ref.startsWith("group.")) {
    const key = ref.slice("group.".length);
    const group = asArray(schema.groups)
      .map((item) => asRecord(item))
      .find((item) => item?.key === key);
    return asRecord(group?.label) as Record<string, string> | null;
  }

  if (ref === "system.fullName" || ref === "system.consent") {
    const overrides = asRecord(schema.overrides);
    const target = asRecord(overrides?.[ref === "system.fullName" ? "fullName" : "consent"]);
    return asRecord(target?.label) as Record<string, string> | null;
  }

  const contacts = asRecord(schema.contacts);
  const contactKey = contactKeyForRef(ref);

  if (contactKey !== null) {
    const contact = asRecord(contacts?.[contactKey]);
    return asRecord(contact?.label) as Record<string, string> | null;
  }

  return null;
}

export function requiredTarget(schema: JsonRecord, ref: string): JsonRecord | null {
  if (ref.startsWith("custom.")) {
    const key = ref.slice("custom.".length);
    return (
      asArray(schema.customFields)
        .map((item) => asRecord(item))
        .find((item) => item?.key === key) ?? null
    );
  }

  if (ref.startsWith("group.")) {
    const key = ref.slice("group.".length);
    return (
      asArray(schema.groups)
        .map((item) => asRecord(item))
        .find((item) => item?.key === key) ?? null
    );
  }

  const contacts = asRecord(schema.contacts);
  const contactKey = contactKeyForRef(ref);

  return contactKey === null ? null : asRecord(contacts?.[contactKey]);
}

export function nextKey(schema: JsonRecord, prefix: string, collection: string): string {
  const existing = new Set(
    asArray(schema[collection])
      .map((item) => asRecord(item))
      .map((item) => stringValue(item?.key))
      .filter((key) => key.length > 0),
  );
  let index = existing.size + 1;
  let key = `${prefix}_${index}`;

  while (existing.has(key)) {
    index += 1;
    key = `${prefix}_${index}`;
  }

  return key;
}

/** Initialize the visual form builder. */
