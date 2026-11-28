// @boundary client
type StripNullish<Props> = {
  [
    PropertyKey in keyof Props as null extends Props[PropertyKey]
      ? never
      : undefined extends Props[PropertyKey]
        ? never
        : PropertyKey
  ]: Props[PropertyKey];
} & {
  [
    PropertyKey in keyof Props as [NonNullable<Props[PropertyKey]>] extends [never]
      ? never
      : null extends Props[PropertyKey]
        ? PropertyKey
        : undefined extends Props[PropertyKey]
          ? PropertyKey
          : never
  ]?: NonNullable<Props[PropertyKey]>;
};

export function stripNulishProps<Props extends Record<string, unknown>>(
  props: Props,
): StripNullish<Props>;

export function stripNulishProps(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value != null));
}
