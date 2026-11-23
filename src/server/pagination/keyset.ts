// @boundary server
import { type } from "arktype";
import { base64url } from "jose";

import { registrationCursorSchema } from "~/events/domain/pagination";
import { TEXT_DECODER } from "~/shared/utils/text-coding";

/** URL query fields accepted by a keyset endpoint. */
export const keysetQueryFields = {
  "before?": "string",
  "after?": "string",
} as const;

export interface CursorCodec<TCursor> {
  encode: (cursor: TCursor) => string;
  decode: (value: string | undefined) => TCursor | null;
}

type ArkErrors = InstanceType<typeof type.errors>;

/** The part of an arktype schema the codec needs. */
interface CursorSchema<TCursor> {
  readonly inferOut: TCursor;
  (data: unknown): TCursor | ArkErrors;
}

/**
 * Build a URL-safe cursor codec. The arktype schema validates decoded values,
 * so cursors can never inject SQL or crash JSON parsing.
 */
export function createCursorCodec<TCursor>(
  schema: CursorSchema<TCursor>,
  maxLength = 512,
): CursorCodec<TCursor> {
  return {
    encode(cursor) {
      return base64url.encode(JSON.stringify(cursor));
    },
    decode(value) {
      if (value === undefined || value.length === 0 || value.length > maxLength) {
        return null;
      }

      try {
        const json = TEXT_DECODER.decode(base64url.decode(value));
        const parsed: unknown = JSON.parse(json);
        const result = schema(parsed);

        return result instanceof type.errors ? null : result;
      } catch {
        return null;
      }
    },
  };
}

/** Encoder/decoder for the registration search cursor used in URL query params. */
export const registrationCursor = createCursorCodec(registrationCursorSchema);
