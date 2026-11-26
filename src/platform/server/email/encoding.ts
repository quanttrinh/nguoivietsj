// @boundary server
import { Buffer } from "node:buffer";

/** Encode binary content as standard base64. */
export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** Encode binary content as base64url without padding. */
export function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

/** Wrap base64 content at 76 characters for MIME parts. */
export function wrapBase64(value: string): string {
  const lines: string[] = [];

  for (let index = 0; index < value.length; index += 76) {
    lines.push(value.slice(index, index + 76));
  }

  return lines.join("\r\n");
}
