// @boundary client
import { css, cx } from "styled-system/css";
import { grid, vstack, wrap } from "styled-system/patterns";
import { noticeStyles } from "~/shared/ui/notice-styles";

export const styles = {
  section: grid({
    gap: {
      base: "8",
      lg: "10",
    },
    gridTemplateColumns: {
      base: "minmax(0, 1fr)",
      lg: "minmax(0, 1fr) minmax(0, 1.15fr)",
    },
    alignItems: "start",
    paddingBlockStart: {
      base: "2",
      lg: "3",
    },
  }),
  hero: vstack({
    gap: "2",
    alignItems: "stretch",
  }),
  heroSection: vstack({
    gap: "5",
    alignItems: "stretch",
  }),
  title: css({
    textStyle: { base: "headline-md", md: "headline-lg" },
    color: "onSurface",
  }),
  lead: css({
    textStyle: "body-lg",
    maxW: "2xl",
    color: "onSurfaceVariant",
  }),
  info: vstack({
    alignItems: "stretch",
    w: "full",
    gap: "2",
  }),
  accordion: css({
    w: "full",
  }),
  infoRows: vstack({
    alignItems: "stretch",
    gap: "0",
  }),
  infoRow: grid({
    gridTemplateColumns: {
      base: "1fr",
      sm: "minmax(5.5rem, 0.35fr) minmax(0, 1fr)",
    },
    gap: {
      base: "1",
      sm: "3",
    },
    py: "2.5",
    borderBlockEndWidth: "thin",
    borderBlockEndStyle: "solid",
    borderColor: "outlineVariant",
    _last: {
      borderBlockEndWidth: "0",
      paddingBlockEnd: "0",
    },
  }),
  infoTerm: css({
    textStyle: "label-caps-wide",
    paddingBlockStart: "0.5",
    textTransform: "uppercase",
    color: "onSurfaceVariant",
  }),
  infoValue: css({
    textStyle: "body-md",
    color: "onSurface",
    whiteSpace: "pre-line",
  }),
  infoMuted: css({
    textStyle: "body-md",
    color: "onSurfaceVariant",
  }),
  ticketList: vstack({
    alignItems: "stretch",
    gap: "0",
  }),
  ticketRow: css({
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "3",
    py: "2.5",
    borderBlockEndWidth: "thin",
    borderBlockEndStyle: "solid",
    borderColor: "outlineVariant",
    _last: {
      borderBlockEndWidth: "0",
      paddingBlockEnd: "0",
    },
  }),
  ticketName: css({
    textStyle: "body-md-medium",
    color: "onSurface",
  }),
  ticketMeta: css({
    fontSize: "xs",
    color: "onSurfaceVariant",
  }),
  ticketPrice: css({
    textStyle: "body-md-strong",
    flexShrink: "0",
    color: "primary",
  }),
  chips: wrap({
    gap: "2",
  }),
  chip: css({
    textStyle: "caption-strong",
    display: "inline-flex",
    rounded: "full",
    bgColor: "secondaryContainer",
    color: "onSecondaryContainer",
    px: "3",
    py: "1",
  }),
  noteList: css({
    textStyle: "body-md",
    ps: "5",
    listStyleType: "disc",
    listStylePosition: "outside",
    color: "onSurface",
  }),
  // Items carry their own marker and rhythm so no rule reaches into foreign markup.
  noteItem: css({
    display: "list-item",
    ps: "1",
    "&:not(:first-child)": {
      paddingBlockStart: "1.5",
    },
    "&::marker": {
      color: "onSurfaceVariant",
    },
  }),
  text: css({
    textStyle: "body-md",
    color: "onSurface",
    whiteSpace: "pre-line",
  }),
  panel: css({
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
  cardTitle: css({
    textStyle: "title-lg",
    color: "onSurface",
  }),
  cardDescription: css({
    paddingBlockStart: "1.5",
    fontSize: "sm",
    color: "onSurfaceVariant",
  }),
  form: vstack({
    alignItems: "stretch",
    gap: "8",
    paddingBlockStart: "6",
  }),
  formSection: vstack({
    alignItems: "stretch",
    gap: "4",
    w: "full",
    paddingBlockStart: "2",
    borderBlockStartWidth: "thin",
    borderBlockStartStyle: "solid",
    borderColor: "outlineVariant",
  }),
  sectionTitle: css({
    textStyle: "title-sm",
    color: "onSurface",
  }),
  sectionDescription: css({
    fontSize: "sm",
    color: "onSurfaceVariant",
  }),
  fields: grid({
    columns: {
      base: 1,
      sm: 2,
    },
    gap: "5",
  }),
  field: css({
    minW: "0",
  }),
  full: css({
    gridColumn: "1 / -1",
  }),
  notice: css({
    w: "full",
  }),
  success: css({
    display: "grid",
    gap: "3",
    paddingBlockStart: "5",
    outlineStyle: "none",
  }),
  errorPanel: cx(
    noticeStyles.error,
    css({
      display: "grid",
      gap: "1.5",
    }),
  ),
  errorTitle: noticeStyles.errorTitle,
  reference: css({
    textStyle: "code-md",
    display: "block",
    paddingBlockStart: "2",
    wordBreak: "break-all",
  }),
  statusLink: css({
    textStyle: "body-md-strong",
    display: "inline-block",
    "&[hidden]": {
      display: "none",
    },
    paddingBlockStart: "3",
    color: "primary",
    textDecoration: "underline",
    textUnderlineOffset: "0.5",
  }),
  actions: wrap({
    align: "center",
    justify: "center",
    gap: "3",
  }),
  turnstile: css({
    display: "flex",
    justifyContent: "center",
    _empty: { display: "none" },
  }),
  group: css({
    minW: "0",
    border: "0",
    p: "0",
  }),
  legend: css({
    textStyle: "body-md-strong",
    p: "0",
    color: "onSurface",
  }),
  groupOptions: css({
    paddingBlockStart: "4",
  }),
  panels: vstack({
    alignItems: "stretch",
    gap: "4",
    paddingBlockStart: "4",
  }),
  panelItem: css({
    minW: "0",
  }),
  error: css({
    paddingBlockStart: "3",
    fontSize: "sm",
    color: "error",
  }),
  errorBox: noticeStyles.error,
};
