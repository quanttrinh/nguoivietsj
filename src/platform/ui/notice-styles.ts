// @boundary client
import { css } from "styled-system/css";

/**
 * Shared notice and error panel styling.
 *
 * Use `notice` for neutral messages that can switch to an error tone with
 * `data-tone="error"`, and `error` for panels that are always errors.
 */
export const noticeStyles = {
  notice: css({
    textStyle: "body-md",
    rounded: "lg",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "tertiary",
    bgColor: "tertiaryContainer",
    color: "onTertiaryContainer",
    px: "4",
    py: "3.5",
    '&[data-tone="error"]': {
      borderColor: "error",
      bgColor: "errorContainer",
      color: "onErrorContainer",
    },
  }),
  error: css({
    textStyle: "body-md",
    rounded: "lg",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "error",
    bgColor: "errorContainer",
    color: "onErrorContainer",
    px: "4",
    py: "3.5",
  }),
  errorTitle: css({
    fontWeight: "semibold",
  }),
};
