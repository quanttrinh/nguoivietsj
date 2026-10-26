/** Event-engine prototype limits. */

/** Maximum JSON body accepted by engine API routes. */
export const MAX_ENGINE_BODY_BYTES = 32 * 1024;

/** Absolute per-registration ticket cap. */
export const MAX_TICKETS_PER_REGISTRATION = 100;

/** Maximum contacts attached to one registration. */
export const MAX_CONTACTS_PER_REGISTRATION = 5;

/** Maximum ticket types attached to one event. */
export const MAX_TICKET_TYPES_PER_EVENT = 20;

/** Maximum metadata JSON size on a registration. */
export const MAX_METADATA_BYTES = 16 * 1024;

/** Maximum JSON size for one custom answer. */
export const MAX_ANSWER_BYTES = 4 * 1024;

/** Maximum JSON size for one published form schema. */
export const MAX_FORM_SCHEMA_BYTES = 64 * 1024;

/** Maximum number of sections in a form schema. */
export const MAX_FORM_SCHEMA_SECTIONS = 12;

/** Maximum number of field placement entries in a form schema. */
export const MAX_FORM_SCHEMA_FIELDS = 200;

/** Maximum aliases attached to one event. */
export const MAX_EVENT_ALIASES = 20;

/** Maximum event alias slug length. */
export const MAX_EVENT_ALIAS_LENGTH = 80;

/** Maximum combined text length for the event aliases textarea. */
export const MAX_EVENT_ALIASES_TEXT_LENGTH = MAX_EVENT_ALIASES * (MAX_EVENT_ALIAS_LENGTH + 1) - 1;

/** Maximum note blocks attached to one event. */
export const MAX_NOTE_BLOCKS = 20;

/** Maximum event note paragraph length. */
export const MAX_NOTE_PARAGRAPH_LENGTH = 1000;

/** Maximum event note bullet length. */
export const MAX_NOTE_BULLET_LENGTH = 300;

/** Maximum combined text length for the note bullets textarea. */
export const MAX_NOTE_BULLETS_TEXT_LENGTH = MAX_NOTE_BLOCKS * (MAX_NOTE_BULLET_LENGTH + 1) - 1;

/** Maximum event location name length. */
export const MAX_EVENT_LOCATION_NAME_LENGTH = 200;

/** Maximum event location address length. */
export const MAX_EVENT_LOCATION_ADDRESS_LENGTH = 500;

/** Maximum cash payment address length. */
export const MAX_EVENT_CASH_ADDRESS_LENGTH = 40;

/** Maximum number of generic groups in a form schema. */
export const MAX_FORM_SCHEMA_GROUPS = 4;

/** Maximum number of members in one generic group. */
export const MAX_FORM_SCHEMA_GROUP_MEMBERS = 10;

/** Maximum number of custom fields in a form schema. */
export const MAX_FORM_SCHEMA_CUSTOM_FIELDS = 10;

/** Maximum number of options for a custom field or group. */
export const MAX_FORM_SCHEMA_OPTIONS = 20;

/** Maximum number of condition nodes in one form schema. */
export const MAX_FORM_SCHEMA_CONDITIONS = 50;

/** Maximum number of condition nodes attached to one field. */
export const MAX_FORM_SCHEMA_CONDITIONS_PER_FIELD = 5;

/** Maximum nesting depth of one condition tree. */
export const MAX_FORM_SCHEMA_CONDITION_DEPTH = 3;

/** Maximum localized string length in a form schema. */
export const MAX_FORM_SCHEMA_TEXT_LENGTH = 500;

/** Maximum event summary length. */
export const MAX_EVENT_SUMMARY_LENGTH = MAX_FORM_SCHEMA_TEXT_LENGTH;

/** Maximum number of locale keys in one localized text object. */
export const MAX_FORM_SCHEMA_LOCALES = 10;

/** Maximum JSON size for one contact's extra value. */
export const MAX_CONTACT_VALUE_BYTES = 4 * 1024;

/** Maximum number of registrations returned by the prototype list endpoint. */
export const MAX_REGISTRATION_LIST_LIMIT = 100;
