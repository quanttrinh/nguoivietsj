// @boundary shared
/** Plain string values for a localized Intlayer dictionary. */
export type PlainValues<TSource> = TSource extends { translation: infer TTranslation }
  ? TTranslation[keyof TTranslation] extends readonly unknown[]
    ? string[]
    : string
  : TSource extends readonly unknown[]
    ? string[]
    : TSource extends Record<string, unknown>
      ? { [Key in keyof TSource]: PlainValues<TSource[Key]> }
      : TSource;
