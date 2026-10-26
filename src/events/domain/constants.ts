/** Shared event-engine domain constants. */

export const CONTACT_KIND = {
  email: "email",
  phone: "phone",
  mail: "mail",
} as const;

export type ContactKind = (typeof CONTACT_KIND)[keyof typeof CONTACT_KIND];

export const EVENT_STATUS = {
  draft: "draft",
  upcoming: "upcoming",
  active: "active",
  archived: "archived",
} as const;

export type EventStatus = (typeof EVENT_STATUS)[keyof typeof EVENT_STATUS];

export const FORM_VERSION_STATUS = {
  draft: "draft",
  published: "published",
  archived: "archived",
} as const;

export type FormVersionStatus = (typeof FORM_VERSION_STATUS)[keyof typeof FORM_VERSION_STATUS];

export const PAYMENT_METHOD = {
  cash: "cash",
  etransfer: "etransfer",
} as const;

export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

export const AUDIT_ACTION = {
  paymentConfirm: "payment.confirm",
  paymentUpdate: "payment.update",
  paymentUnconfirm: "payment.unconfirm",
} as const;

export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

export const DEFAULT_TIMEZONE = "UTC";
export const DEFAULT_CURRENCY = "CAD";
