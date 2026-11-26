// @boundary client
import { css } from "styled-system/css";
import { center, vstack } from "styled-system/patterns";

/** Shared full-page guard layout used by 404 and access/status errors. */
export const guardPageStyles = {
  section: center({
    textAlign: "center",
    paddingBlockStart: { base: "2", md: "3" },
    paddingBlockEnd: "16",
  }),
  panel: vstack({ alignItems: "center", gap: "4", maxW: "xl" }),
  title: css({
    textStyle: { base: "headline-md", md: "headline-lg" },
    color: "onSurface",
  }),
  message: css({ textStyle: "body-lg", color: "onSurfaceVariant" }),
} as const;
