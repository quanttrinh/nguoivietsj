// @boundary client
import { css, cx } from "styled-system/css";
import { grid, vstack, wrap } from "styled-system/patterns";
import { noticeStyles } from "~/shared/ui/notice-styles";

/** Shared form controls for the event-engine admin catalog. */
export const adminStyles = {
  pageSection: vstack({
    alignItems: "stretch",
    gap: "7",
    paddingBlockStart: { base: "2", md: "3" },
  }),
  pageTop: vstack({ alignItems: "stretch", gap: "3" }),
  pageHeading: vstack({ alignItems: "stretch", gap: "2" }),
  pageTitle: css({
    textStyle: { base: "headline-md", md: "headline-lg" },
  }),
  pageBack: css({
    textStyle: "body-md-strong",
    color: "primary",
    textDecoration: "underline",
    textUnderlineOffset: "0.5",
  }),
  pageIntro: css({
    maxW: "3xl",
    fontSize: "md",
    color: "onSurfaceVariant",
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
  pageActions: wrap({ align: "center", gap: "3" }),
  panel: css({
    w: "full",
    rounded: "2xl",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "outlineVariant",
    bgColor: "surfaceContainerLowest",
    shadow: "lg",
    px: { base: "5", md: "10" },
    py: { base: "6", md: "10" },
  }),
  notice: noticeStyles.notice,
  form: vstack({ alignItems: "stretch", gap: "6" }),
  fieldGrid: grid({
    gap: "4",
    gridTemplateColumns: { base: "1fr", md: "1fr 1fr" },
  }),
  field: vstack({ alignItems: "stretch", gap: "1.5" }),
  fieldWide: css({ gridColumn: "1 / -1" }),
  sectionBody: css({ paddingBlockStart: "5" }),
  label: css({
    textStyle: "body-md-strong",
    color: "onSurface",
  }),
  help: css({
    textStyle: "caption",
    color: "onSurfaceVariant",
  }),
  sectionTitle: css({
    textStyle: "title-lg",
    color: "onSurface",
  }),
  sectionDescription: css({
    fontSize: "sm",
    color: "onSurfaceVariant",
  }),
  instructions: vstack({ alignItems: "stretch", gap: "3", py: "4" }),
  instructionsText: css({
    fontSize: "sm",
    color: "onSurfaceVariant",
  }),
  instructionsCode: css({
    overflowX: "auto",
    rounded: "lg",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "outlineVariant",
    bgColor: "surfaceContainerHigh",
    p: "4",
    textStyle: "code-sm",
  }),
  actions: wrap({ align: "center", gap: "3", paddingBlockStart: "2" }),
  errorList: css({
    textStyle: "body-md",
    ps: "5",
  }),
  noteEditor: vstack({ alignItems: "stretch", gap: "4", paddingBlockStart: "4" }),
  noteBlockHeader: wrap({ align: "center", justify: "space-between", gap: "2" }),
  noteBlockActions: wrap({ align: "center", gap: "2" }),
  ticketCard: cx(
    grid({ gap: "3" }),
    css({
      rounded: "lg",
      borderWidth: "thin",
      borderStyle: "solid",
      borderColor: "outlineVariant",
      bgColor: "surfaceContainerLow",
      p: "4",
    }),
  ),
  ticketHeader: wrap({
    align: "center",
    justify: "space-between",
    gap: "2",
  }),
  ticketTitle: css({
    textStyle: "body-md-strong",
    color: "onSurface",
  }),
  readOnly: css({
    fontSize: "sm",
    color: "onSurfaceVariant",
  }),
  meta: wrap({ gap: "2", fontSize: "sm", color: "onSurfaceVariant" }),
  badge: css({
    textStyle: "caption-strong",
    rounded: "full",
    bgColor: "surfaceContainerHigh",
    px: "2.5",
    py: "0.5",
  }),
};

/** Common page-level aliases shared by admin pages. */
export const adminPageStyles = {
  section: adminStyles.pageSection,
  top: adminStyles.pageTop,
  heading: adminStyles.pageHeading,
  title: adminStyles.pageTitle,
  back: adminStyles.pageBack,
  intro: adminStyles.pageIntro,
  table: adminStyles.table,
  th: adminStyles.th,
  td: adminStyles.td,
  link: adminStyles.link,
  empty: adminStyles.empty,
  actions: adminStyles.pageActions,
  meta: adminStyles.meta,
  badge: adminStyles.badge,
};
