// @boundary shared
/**
 * Encode trusted, locally generated SVG markup as a data URI for `<img src>`.
 * Rendering through an image document avoids HTML parsing sinks entirely.
 */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
