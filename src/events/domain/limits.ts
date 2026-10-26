// @boundary shared
/**
 * Single source of truth for event-engine limits.
 *
 * Keep numeric limits grouped by the thing they protect instead of exporting
 * dozens of unrelated top-level constants. Named aliases are re-exported below
 * for UI controls that only need one value.
 */
export const LIMITS = {
  list: {
    events: 25,
    users: 25,
    registrations: 100,
    activity: 200,
    checkins: 100,
    payments: 100,
    overviewRegistrations: 25,
    supportPage: 25,
    supportMaxPage: 10_000,
  },
  text: {
    fullName: 200,
    phone: 40,
    email: 254,
    addressLine: 200,
    city: 100,
    province: 100,
    country: 100,
    postalCode: 7,
    contactLabel: 80,
    jsonKey: 64,
    currency: 3,
  },
  registration: {
    ticketsPerRegistration: 100,
    contacts: 5,
    metadataBytes: 16 * 1024,
    answerBytes: 4 * 1024,
    contactValueBytes: 4 * 1024,
    maxFormVersion: 1_000_000,
  },
  event: {
    slug: 80,
    type: 40,
    timezone: 64,
    url: 1000,
    summary: 500,
    noteBlocks: 20,
    noteParagraph: 1000,
    noteBullet: 300,
    locationName: 200,
    locationAddress: 500,
    noteLinkLabel: 80,
    aliases: 20,
    alias: 80,
    ticketTypes: 20,
    cashAddress: 40,
    editionYearMin: 2000,
    editionYearMax: 2100,
  },
  payment: {
    note: 500,
    amountMinor: 100_000_000,
  },
  search: {
    query: 40,
  },
  form: {
    schemaBytes: 64 * 1024,
    sections: 12,
    fields: 200,
    groups: 4,
    groupMembers: 10,
    customFields: 10,
    options: 20,
    conditions: 50,
    conditionsPerField: 5,
    conditionDepth: 3,
    text: 500,
    locales: 10,
    optionValue: 100,
    customText: 10_000,
    textareaRows: 20,
    order: 1_000_000,
    groupCount: 10,
  },
} as const;

// Derived textarea limits.
export const EVENT_ALIASES_TEXT_LENGTH = LIMITS.event.aliases * (LIMITS.event.alias + 1) - 1;
export const NOTE_BULLETS_TEXT_LENGTH = LIMITS.event.noteBlocks * (LIMITS.event.noteBullet + 1) - 1;

// Named aliases kept for form controls and service code. Values always come
// from `LIMITS`, so changing a policy only happens in one place.
export const MAX_REGISTRATION_LIST_LIMIT = LIMITS.list.registrations;
export const MAX_FULL_NAME_LENGTH = LIMITS.text.fullName;
export const MAX_PHONE_NUMBER_LENGTH = LIMITS.text.phone;
export const MAX_EMAIL_ADDRESS_LENGTH = LIMITS.text.email;
export const MAX_ADDRESS_LINE_LENGTH = LIMITS.text.addressLine;
export const MAX_CITY_LENGTH = LIMITS.text.city;
export const MAX_PROVINCE_LENGTH = LIMITS.text.province;
export const MAX_COUNTRY_LENGTH = LIMITS.text.country;
export const MAX_POSTAL_CODE_LENGTH = LIMITS.text.postalCode;
export const MAX_CONTACT_LABEL_LENGTH = LIMITS.text.contactLabel;
export const MAX_JSON_KEY_LENGTH = LIMITS.text.jsonKey;
export const MAX_CURRENCY_CODE_LENGTH = LIMITS.text.currency;
export const MAX_TICKETS_PER_REGISTRATION = LIMITS.registration.ticketsPerRegistration;
export const MAX_CONTACTS_PER_REGISTRATION = LIMITS.registration.contacts;
export const MAX_METADATA_BYTES = LIMITS.registration.metadataBytes;
export const MAX_ANSWER_BYTES = LIMITS.registration.answerBytes;
export const MAX_CONTACT_VALUE_BYTES = LIMITS.registration.contactValueBytes;
export const MAX_EVENT_SLUG_LENGTH = LIMITS.event.slug;
export const MAX_EVENT_TYPE_LENGTH = LIMITS.event.type;
export const MAX_EVENT_TIMEZONE_LENGTH = LIMITS.event.timezone;
export const MAX_EVENT_URL_LENGTH = LIMITS.event.url;
export const MAX_EVENT_SUMMARY_LENGTH = LIMITS.event.summary;
export const MAX_NOTE_BLOCKS = LIMITS.event.noteBlocks;
export const MAX_NOTE_PARAGRAPH_LENGTH = LIMITS.event.noteParagraph;
export const MAX_NOTE_BULLET_LENGTH = LIMITS.event.noteBullet;
export const MAX_EVENT_LOCATION_NAME_LENGTH = LIMITS.event.locationName;
export const MAX_EVENT_LOCATION_ADDRESS_LENGTH = LIMITS.event.locationAddress;
export const MAX_EVENT_NOTE_LINK_LABEL_LENGTH = LIMITS.event.noteLinkLabel;
export const MAX_EVENT_ALIASES = LIMITS.event.aliases;
export const MAX_EVENT_ALIAS_LENGTH = LIMITS.event.alias;
export const MAX_TICKET_TYPES_PER_EVENT = LIMITS.event.ticketTypes;
export const MAX_EVENT_CASH_ADDRESS_LENGTH = LIMITS.event.cashAddress;
export const MAX_PAYMENT_NOTE_LENGTH = LIMITS.payment.note;
export const MAX_PAYMENT_AMOUNT_MINOR = LIMITS.payment.amountMinor;
export const MAX_REGISTRATION_SEARCH_QUERY_LENGTH = LIMITS.search.query;

// Derived admin textarea limits.
export const MAX_EVENT_ALIASES_TEXT_LENGTH = EVENT_ALIASES_TEXT_LENGTH;
export const MAX_NOTE_BULLETS_TEXT_LENGTH = NOTE_BULLETS_TEXT_LENGTH;

// Form-schema limits.
export const MAX_FORM_SCHEMA_BYTES = LIMITS.form.schemaBytes;
export const MAX_FORM_SCHEMA_SECTIONS = LIMITS.form.sections;
export const MAX_FORM_SCHEMA_FIELDS = LIMITS.form.fields;
export const MAX_FORM_SCHEMA_GROUPS = LIMITS.form.groups;
export const MAX_FORM_SCHEMA_GROUP_MEMBERS = LIMITS.form.groupMembers;
export const MAX_FORM_SCHEMA_CUSTOM_FIELDS = LIMITS.form.customFields;
export const MAX_FORM_SCHEMA_OPTIONS = LIMITS.form.options;
export const MAX_FORM_SCHEMA_CONDITIONS = LIMITS.form.conditions;
export const MAX_FORM_SCHEMA_CONDITIONS_PER_FIELD = LIMITS.form.conditionsPerField;
export const MAX_FORM_SCHEMA_CONDITION_DEPTH = LIMITS.form.conditionDepth;
export const MAX_FORM_SCHEMA_TEXT_LENGTH = LIMITS.form.text;
export const MAX_FORM_SCHEMA_LOCALES = LIMITS.form.locales;
