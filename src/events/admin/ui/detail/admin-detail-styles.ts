// @boundary client
import { css } from "styled-system/css";
import { grid, vstack, wrap } from "styled-system/patterns";

export const styles = {
  section: vstack({
    alignItems: "stretch",
    gap: "7",
    paddingBlockStart: {
      base: "2",
      md: "3",
    },
  }),
  top: vstack({
    alignItems: "stretch",
    gap: "3",
  }),
  title: css({
    textStyle: { base: "headline-md", md: "headline-lg" },
  }),
  back: css({
    textStyle: "body-md-strong",
    color: "primary",
    textDecoration: "underline",
    textUnderlineOffset: "0.5",
  }),
  meta: wrap({
    gap: "2",
    fontSize: "sm",
    color: "onSurfaceVariant",
  }),
  badge: css({
    textStyle: "caption-strong",
    rounded: "full",
    bgColor: "surfaceContainerHigh",
    px: "2.5",
    py: "0.5",
  }),
  actions: wrap({
    align: "center",
    gap: "3",
    paddingBlockStart: "2",
  }),
  grid: grid({
    gap: "5",
    gridTemplateColumns: {
      base: "1fr",
      lg: "1fr 1fr",
    },
  }),
  panel: css({
    w: "full",
    rounded: "2xl",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "outlineVariant",
    bgColor: "surfaceContainerLowest",
    shadow: "lg",
    px: {
      base: "5",
      md: "10",
    },
    py: {
      base: "6",
      md: "10",
    },
  }),
  panelHeading: wrap({
    align: "baseline",
    justify: "space-between",
    gap: "3",
  }),
  cardTitle: css({
    textStyle: "title-lg",
  }),
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
  link: css({ textStyle: "link-strong", color: "primary", textUnderlineOffset: "0.5" }),
  empty: css({
    paddingBlockStart: "3",
    fontSize: "sm",
    color: "onSurfaceVariant",
  }),
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
  dangerButton: css({
    "--md-sys-color-primary": "var(--md-sys-color-error)",
  }),
};
