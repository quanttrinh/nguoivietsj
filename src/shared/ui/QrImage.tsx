// @boundary client
import type { JSX } from "preact";

import { svgDataUri } from "~/shared/utils/svg";

/**
 * Render trusted SVG as an image document.
 *
 * The browser does not execute scripts or event handlers in SVG loaded through
 * `<img>`, so no HTML parsing sink is involved.
 */
export function QrImage(props: { svg: string; class?: string }): JSX.Element {
  return <img alt="" class={props.class} src={svgDataUri(props.svg)} />;
}
