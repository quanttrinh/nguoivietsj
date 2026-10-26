// @boundary client
import { css } from "styled-system/css";

/** Shared table styling for the admin pages. */
export const tableStyles = {
  error: css({
    rounded: "lg",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "error",
    bgColor: "errorContainer",
    color: "onErrorContainer",
    p: "4",
    fontSize: "sm",
  }),
  note: css({ fontSize: "xs", color: "onSurfaceVariant" }),
  empty: css({ fontSize: "sm", color: "onSurfaceVariant" }),
  table: css({
    w: "full",
    borderCollapse: "collapse",
    paddingBlockStart: "4",
    fontSize: "sm",
  }),
  th: css({
    textAlign: "start",
    borderBlockEndWidth: "thin",
    borderBlockEndStyle: "solid",
    borderColor: "outlineVariant",
    py: "2",
    pe: "3",
    color: "onSurfaceVariant",
    fontWeight: "semibold",
  }),
  td: css({
    borderBlockEndWidth: "thin",
    borderBlockEndStyle: "solid",
    borderColor: "outlineVariant",
    py: "2.5",
    pe: "3",
    verticalAlign: "top",
  }),
  badge: css({
    textStyle: "caption-strong",
    display: "inline-flex",
    rounded: "full",
    bgColor: "surfaceContainerHigh",
    color: "onSurfaceVariant",
    px: "2",
    py: "0.5",
  }),
  code: css({
    textStyle: "code-sm",
    wordBreak: "break-word",
  }),
  link: css({ textStyle: "link-strong", color: "primary", textUnderlineOffset: "0.5" }),
} as const;
