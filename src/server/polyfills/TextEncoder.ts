import { textEncode, type SupportedEncoding } from '@borewit/text-codec';

class TextEncoderPolyfill {
  private readonly encoding: SupportedEncoding = 'utf-8';

  constructor(encoding?: SupportedEncoding) {
    if (
      encoding &&
      (
        [
          'utf-8',
          'utf8',
          'utf-16le',
          'ascii',
          'latin1',
          'iso-8859-1',
          'windows-1252',
        ] as SupportedEncoding[]
      ).includes(encoding)
    ) {
      this.encoding = encoding;
    }
  }

  encode(input: string): Uint8Array {
    return textEncode(input, this.encoding);
  }
}

if (!(globalThis as any).TextEncoder) {
  (globalThis as any).TextEncoder = TextEncoderPolyfill;
}

export { TextEncoderPolyfill as TextEncoder };
export default TextEncoderPolyfill;
