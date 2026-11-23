// @boundary client
import type { StatusContentValues } from "~/events/content/status.content";
import type { RegistrationCardLabels } from "~/events/ui/registration/labels";

/** Keys from the status dictionary used by the status view. */
export const statusViewLabelKeys = [
  "backToEvent",
  "cashInstruction",
  "etransferInstruction",
  "findAnother",
  "heading",
  "intro",
  "linkInvalid",
  "linkInvalidTitle",
  "noPaymentInstructions",
  "paymentInstructions",
  "qrHelp",
  "qrPending",
  "qrTitle",
] as const satisfies readonly (keyof StatusContentValues)[];

export type StatusViewLabels = RegistrationCardLabels &
  Pick<StatusContentValues, (typeof statusViewLabelKeys)[number]>;
