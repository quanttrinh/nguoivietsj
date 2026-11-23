// @boundary client
import type { AdminContentValues } from "~/events/content/admin.content";

export const eventFormLabelKeys = [
  "active",
  "addBulletList",
  "addLink",
  "addParagraph",
  "addTicketType",
  "aliases",
  "aliasesHelp",
  "cancel",
  "capacity",
  "cashAddress",
  "cashMapEmbedUrl",
  "cashMapUrl",
  "cashPayment",
  "cloneEvent",
  "cloneEventIntro",
  "createEvent",
  "createEventIntro",
  "currency",
  "defaultLocale",
  "defaultLocaleHelp",
  "defaultQuantity",
  "editEventIntro",
  "editionYear",
  "enabled",
  "endsAt",
  "etransferEmail",
  "etransferPayment",
  "eventIdentity",
  "eventLimits",
  "eventLocation",
  "eventTitle",
  "eventType",
  "initialTicketTypes",
  "invalidPayload",
  "loadFailed",
  "localizedContent",
  "locationAddress",
  "locationMapEmbedUrl",
  "locationMapUrl",
  "locationName",
  "maxPerRegistration",
  "maxTicketsPerRegistration",
  "maxTotalTickets",
  "minPerRegistration",
  "moveDown",
  "moveUp",
  "noLimit",
  "noteBullets",
  "noteBulletsHelp",
  "noteLabel",
  "noteLink",
  "noteParagraph",
  "noteText",
  "noteUrl",
  "notesHelp",
  "notesSection",
  "optionalTranslation",
  "optionalUrl",
  "paymentMethods",
  "priceMinor",
  "priceMinorHelp",
  "registrationOpen",
  "removeNoteBlock",
  "removeTicketType",
  "saveEvent",
  "saveFailed",
  "saved",
  "saving",
  "slug",
  "sortOrder",
  "startsAt",
  "status",
  "statusActive",
  "statusArchived",
  "statusDraft",
  "statusUpcoming",
  "summary",
  "ticketDescription",
  "ticketKey",
  "ticketLabel",
  "ticketTypes",
  "timezone",
] as const satisfies readonly (keyof AdminContentValues)[];

export type EventFormLabels = Pick<AdminContentValues, (typeof eventFormLabelKeys)[number]>;

export const formEditorLabelKeys = [
  "active",
  "cancel",
  "formEditorCopyNotice",
  "formSavedDraft",
  "formSavedPublished",
  "formSchema",
  "formSchemaHelp",
  "formSchemaInstructionsConditions",
  "formSchemaInstructionsExample",
  "formSchemaInstructionsIntro",
  "formSchemaInstructionsKeys",
  "formSchemaInstructionsLocalized",
  "formSchemaInstructionsRefs",
  "formSchemaInstructionsTitle",
  "formSchemaInstructionsValidation",
  "formValidationFailed",
  "formatFailed",
  "formatJson",
  "loadFailed",
  "newVersion",
  "noTicketTypesForForm",
  "publishForm",
  "saveDraft",
  "saveFailed",
  "saving",
  "sourceVersion",
] as const satisfies readonly (keyof AdminContentValues)[];

export type FormEditorLabels = Pick<AdminContentValues, (typeof formEditorLabelKeys)[number]>;

export const ticketTypeFormLabelKeys = [
  "active",
  "addTicketType",
  "archiveTicketConfirm",
  "archiveTicketType",
  "cancel",
  "capacity",
  "defaultQuantity",
  "editTicketType",
  "invalidPayload",
  "loadFailed",
  "maxPerRegistration",
  "minPerRegistration",
  "newTicketType",
  "noLimit",
  "priceMinor",
  "priceMinorHelp",
  "removeTicketType",
  "save",
  "saveFailed",
  "saving",
  "sortOrder",
  "ticketDescription",
  "ticketKey",
  "ticketLabel",
  "ticketSaveFailed",
  "ticketTypeIntro",
  "ticketTypes",
] as const satisfies readonly (keyof AdminContentValues)[];

export type TicketTypeFormLabels = Pick<
  AdminContentValues,
  (typeof ticketTypeFormLabelKeys)[number]
>;

export type NoteBlockLabels = Pick<
  AdminContentValues,
  | "moveDown"
  | "moveUp"
  | "noteBullets"
  | "noteBulletsHelp"
  | "noteLabel"
  | "noteLink"
  | "noteParagraph"
  | "noteText"
  | "noteUrl"
  | "removeNoteBlock"
>;

export type TicketFieldsLabels = Pick<
  AdminContentValues,
  | "active"
  | "capacity"
  | "defaultQuantity"
  | "maxPerRegistration"
  | "minPerRegistration"
  | "noLimit"
  | "priceMinor"
  | "priceMinorHelp"
  | "removeTicketType"
  | "sortOrder"
  | "ticketDescription"
  | "ticketKey"
  | "ticketLabel"
  | "ticketTypes"
>;
