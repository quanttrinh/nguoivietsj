import { textDecode, type SupportedEncoding } from '@borewit/text-codec';

class TextDecoderPolyfill {
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

  decode(input: Uint8Array): string {
    return textDecode(input, this.encoding);
  }
}

if (!(globalThis as any).TextDecoder) {
  (globalThis as any).TextDecoder = TextDecoderPolyfill;
}

export { TextDecoderPolyfill as TextDecoder };
export default TextDecoderPolyfill;
