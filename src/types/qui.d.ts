/* oxlint-disable typescript/no-empty-interface, typescript/no-empty-object-type -- module augmentation requires an empty interface body. */
import "@quanttrinh/qui";
import type { HTMLAttributes } from "preact";

type QuiTag = Extract<keyof HTMLElementTagNameMap, `qui-${string}`>;

type Optionalize<T> = {
  [Key in keyof T]?: T[Key] | undefined;
};

type ElementProps<Tag extends QuiTag> = {
  [Key in Exclude<keyof HTMLElementTagNameMap[Tag], keyof HTMLElement | "componentOnReady">]?:
    | HTMLElementTagNameMap[Tag][Key]
    | undefined;
};

/**
 * Bridge the Qui custom elements into Preact's JSX namespace.
 *
 * `@quanttrinh/qui` augments the global `HTMLElementTagNameMap`, so the element
 * list and props stay in sync with the installed package without a
 * hand-maintained allowlist.
 */
type QuiIntrinsicElements = {
  [Tag in QuiTag]: Optionalize<HTMLAttributes<HTMLElement>> & ElementProps<Tag>;
};

declare module "preact" {
  namespace JSX {
    interface IntrinsicElements extends QuiIntrinsicElements {}
  }
}
