// @boundary client
import { css, cx } from "styled-system/css";
import { grid, hstack, vstack } from "styled-system/patterns";

const table = css({
  w: "full",
  borderCollapse: "collapse",
  paddingBlockStart: "4",
  fontSize: "sm",
});

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
  table,
  responsiveTable: cx(table, css({ display: { base: "none", lg: "table" } })),
  mobileCards: vstack({
    alignItems: "stretch",
    gap: "3",
    paddingBlockStart: "4",
    display: { base: "flex", lg: "none" },
  }),
  mobileCard: css({
    rounded: "lg",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "outlineVariant",
    p: "4",
  }),
  mobileCardHeading: hstack({
    alignItems: "center",
    justify: "space-between",
    gap: "3",
    paddingBlockEnd: "2",
  }),
  mobileCardGrid: grid({
    gridTemplateColumns: { base: "1fr 1fr", sm: "repeat(3, 1fr)" },
    gap: "3",
  }),
  mobileCardLabel: css({ display: "block", color: "onSurfaceVariant", fontSize: "xs" }),
  mobileCardValue: css({ fontSize: "sm", wordBreak: "break-word" }),
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
