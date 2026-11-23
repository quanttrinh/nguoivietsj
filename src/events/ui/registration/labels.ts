// @boundary client
import type { AdminContentValues } from "~/events/content/admin.content";

/** Keys from the admin dictionary used by the shared registration detail cards. */
export const registrationCardLabelKeys = [
  "event",
  "fullName",
  "registrationId",
  "formVersion",
  "createdAt",
  "contacts",
  "contactLabel",
  "noContacts",
  "primaryContact",
  "confirmationContact",
  "email",
  "phone",
  "mail",
  "addressLine1",
  "addressLine2",
  "city",
  "province",
  "postalCode",
  "country",
  "tickets",
  "quantity",
  "unitPrice",
  "amountDue",
  "amountPaid",
  "paid",
  "unpaid",
  "noPaymentRequired",
  "paymentConfirmed",
  "paymentPending",
  "paymentStatus",
  "paymentMethod",
  "paymentNote",
  "paymentConfirmedAt",
  "paymentMethodCash",
  "paymentMethodEtransfer",
  "paymentMethodOther",
  "checkedIn",
  "notCheckedIn",
  "customAnswers",
  "noAnswers",
  "answerKey",
  "answerValue",
  "metadata",
  "registrationNotFound",
] as const satisfies readonly (keyof AdminContentValues)[];

/** Labels consumed by the shared registration detail cards. */
export type RegistrationCardLabels = Pick<
  AdminContentValues,
  (typeof registrationCardLabelKeys)[number]
>;
