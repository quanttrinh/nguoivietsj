import { css } from "styled-system/css";

/** Shared table styling for the admin pages. */
export const tableStyles = {
  error: css({
    margin: "0",
    borderRadius: "lg",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "error",
    backgroundColor: "errorContainer",
    color: "onErrorContainer",
    padding: "4",
    fontSize: "sm",
  }),
  note: css({ margin: "0", fontSize: "xs", color: "onSurfaceVariant" }),
  empty: css({ margin: "0", marginBlockStart: "3", fontSize: "sm", color: "onSurfaceVariant" }),
  table: css({
    width: "full",
    borderCollapse: "collapse",
    marginBlockStart: "4",
    fontSize: "sm",
  }),
  th: css({
    textAlign: "start",
    borderBlockEndWidth: "thin",
    borderBlockEndStyle: "solid",
    borderColor: "outlineVariant",
    paddingBlock: "2",
    paddingInlineEnd: "3",
    color: "onSurfaceVariant",
    fontWeight: "semibold",
  }),
  td: css({
    borderBlockEndWidth: "thin",
    borderBlockEndStyle: "solid",
    borderColor: "outlineVariant",
    paddingBlock: "2.5",
    paddingInlineEnd: "3",
    verticalAlign: "top",
  }),
  badge: css({
    display: "inline-flex",
    borderRadius: "full",
    backgroundColor: "surfaceContainerHigh",
    color: "onSurfaceVariant",
    fontSize: "xs",
    fontWeight: "semibold",
    paddingInline: "2",
    paddingBlock: "0.5",
  }),
  code: css({ fontFamily: "mono", fontSize: "xs", wordBreak: "break-word" }),
  link: css({
    color: "primary",
    fontWeight: "semibold",
    textDecoration: "underline",
    textUnderlineOffset: "0.5",
  }),
} as const;
