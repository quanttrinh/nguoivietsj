import { CONTACT_KIND } from "~/events/domain/constants";
/* oxlint-disable eslint/max-params -- Resolver helpers take explicit schema maps and locale context. */
import {
  FORM_FIELD_KIND,
  FORM_FIELD_WIDTH,
  FORM_REF,
  FORM_REF_PREFIX,
  customRef,
  groupRef,
  isCustomRef,
  isGroupRef,
  isSystemTicketRef,
  refKey,
} from "~/events/domain/form-schema/constants";
import {
  contactLabel,
  resolveContactConfig,
  resolveContactField,
  resolveMailField,
  type ResolvedConfirmation,
  type ResolvedConfirmationMethod,
  type ResolvedContactConfig,
  type ResolvedContactField,
  type ResolvedMailField,
} from "~/events/domain/form-schema/resolve/resolve-contact";
import {
  activeTicketTypes,
  resolveTicket,
  type ResolvedTicketType,
} from "~/events/domain/form-schema/resolve/resolve-ticket";
import type {
  EngineClientConfig,
  FormCondition,
  FormContactsConfig,
  FormCustomField,
  FormFieldWidth,
  FormGroup,
  FormGroupMode,
  FormGroupRenderer,
  FormSchema,
} from "~/events/domain/form-schema/types";
import { localized, nullableLocalized } from "~/events/domain/localized";
import type {
  EventDetail,
  EventLocation,
  EventNotes,
  EventPayments,
  EventStatus,
} from "~/events/domain/types";
import { DEFAULT_LOCALE } from "~/shared/constants/locales";

export type {
  ResolvedConfirmation,
  ResolvedConfirmationMethod,
  ResolvedContactConfig,
  ResolvedContactField,
  ResolvedMailField,
} from "~/events/domain/form-schema/resolve/resolve-contact";
export type { ResolvedTicketType } from "~/events/domain/form-schema/resolve/resolve-ticket";

export interface ResolvedEvent {
  id: string;
  slug: string;
  status: EventStatus;
  title: string;
  summary: string;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  location: EventLocation;
  payments: EventPayments;
  notes: EventNotes[string];
  registrationOpen: boolean;
}

export interface ResolvedFullNameField {
  kind: typeof FORM_FIELD_KIND.fullName;
  ref: typeof FORM_REF.fullName;
  width: FormFieldWidth;
  label: string | null;
  help: string | null;
  placeholder: string | null;
  required: true;
}

export interface ResolvedConsentField {
  kind: typeof FORM_FIELD_KIND.consent;
  ref: typeof FORM_REF.consent;
  width: FormFieldWidth;
  label: string | null;
  help: string | null;
  placeholder: null;
  required: true;
}

export interface ResolvedConfirmationField {
  kind: typeof FORM_FIELD_KIND.confirmation;
  ref: typeof FORM_REF.confirmation;
  width: typeof FORM_FIELD_WIDTH.full;
  mode: ResolvedConfirmation["mode"];
  methods: ResolvedConfirmationMethod[];
}

export interface ResolvedTicketField {
  kind: typeof FORM_FIELD_KIND.ticket;
  ref: string;
  width: FormFieldWidth;
  ticket: ResolvedTicketType;
}

export interface ResolvedCustomOption {
  value: string;
  label: string;
}

export interface ResolvedCustomField {
  kind: typeof FORM_FIELD_KIND.custom;
  ref: string;
  key: string;
  type: FormCustomField["type"];
  width: FormFieldWidth;
  required: boolean;
  label: string;
  help: string | null;
  placeholder: string | null;
  minLength: number | null;
  maxLength: number | null;
  min: number | null;
  max: number | null;
  step: number | null;
  rows: number | null;
  defaultValue: unknown;
  options: ResolvedCustomOption[];
  visibleWhen: FormCondition | null;
  requiredWhen: FormCondition | null;
}

export type ResolvedGroupMember = ResolvedContactField | ResolvedMailField | ResolvedCustomField;

export interface ResolvedGroupOption {
  ref: string;
  label: string;
}

export interface ResolvedGroup {
  key: string;
  ref: string;
  label: string;
  mode: FormGroupMode;
  renderer: FormGroupRenderer;
  required: boolean;
  default: string | null;
  width: typeof FORM_FIELD_WIDTH.full;
  members: ResolvedGroupMember[];
  options: ResolvedGroupOption[];
}

export interface ResolvedGroupField {
  kind: typeof FORM_FIELD_KIND.group;
  ref: string;
  width: typeof FORM_FIELD_WIDTH.full;
  group: ResolvedGroup;
}

export type ResolvedField =
  | ResolvedFullNameField
  | ResolvedConsentField
  | ResolvedContactField
  | ResolvedMailField
  | ResolvedConfirmationField
  | ResolvedTicketField
  | ResolvedCustomField
  | ResolvedGroupField;

export interface ResolvedSection {
  key: string;
  label: string;
  description: string | null;
  fields: ResolvedField[];
}

export interface ResolvedRegistrationForm {
  event: ResolvedEvent;
  formVersion: number;
  locale: string;
  sections: ResolvedSection[];
  tickets: ResolvedTicketType[];
  contacts: {
    email: ResolvedContactConfig;
    phone: ResolvedContactConfig;
    mail: ResolvedContactConfig;
    confirmation: ResolvedConfirmation;
  };
  groups: ResolvedGroup[];
  customFields: ResolvedCustomField[];
  submit: {
    action: string;
  };
  client: EngineClientConfig;
}

interface ResolveInput {
  event: EventDetail;
  schema: FormSchema;
  formVersion: number;
  locale: string;
}

function resolveCustomField(
  field: FormCustomField,
  locale: string,
  width: FormFieldWidth,
): ResolvedCustomField {
  return {
    kind: FORM_FIELD_KIND.custom,
    ref: customRef(field.key),
    key: field.key,
    type: field.type,
    width,
    required: field.required === true,
    label: localized(field.label, locale, field.key),
    help: nullableLocalized(field.help, locale),
    placeholder: nullableLocalized(field.placeholder, locale),
    minLength: field.minLength ?? null,
    maxLength: field.maxLength ?? null,
    min: field.min ?? null,
    max: field.max ?? null,
    step: field.step ?? null,
    rows: field.rows ?? null,
    defaultValue: field.defaultValue,
    options: (field.options ?? []).map((option) => ({
      value: option.value,
      label: localized(option.label, locale, option.value),
    })),
    visibleWhen: field.visibleWhen ?? null,
    requiredWhen: field.requiredWhen ?? null,
  };
}

function resolveGroupMember(
  ref: string,
  contacts: FormContactsConfig,
  customFields: ReadonlyMap<string, FormCustomField>,
  locale: string,
): ResolvedGroupMember | null {
  if (ref === FORM_REF.contactEmail || ref === FORM_REF.contactPhone) {
    return resolveContactField(
      ref === FORM_REF.contactEmail ? CONTACT_KIND.email : CONTACT_KIND.phone,
      contacts,
      locale,
      FORM_FIELD_WIDTH.full,
    );
  }

  if (ref === FORM_REF.contactMail) {
    return resolveMailField(contacts, locale);
  }

  if (isCustomRef(ref)) {
    const field = customFields.get(refKey(ref, FORM_REF_PREFIX.custom) ?? "");

    if (field !== undefined) {
      return resolveCustomField(field, locale, FORM_FIELD_WIDTH.full);
    }
  }

  return null;
}

function resolveGroup(
  group: FormGroup,
  contacts: FormContactsConfig,
  customFields: ReadonlyMap<string, FormCustomField>,
  locale: string,
): ResolvedGroup {
  const members = group.members
    .map((ref) => resolveGroupMember(ref, contacts, customFields, locale))
    .filter((member): member is ResolvedGroupMember => member !== null);
  const optionsByRef = new Map(
    (group.options ?? []).map((option) => [
      option.ref,
      localized(option.label, locale, option.ref),
    ]),
  );
  const options = members.map((member) => ({
    ref: member.ref,
    label: optionsByRef.get(member.ref) ?? member.label,
  }));
  const firstMember = members[0]?.ref ?? null;
  const selectedDefault = group.default ?? (group.required === true ? firstMember : null);

  return {
    key: group.key,
    ref: groupRef(group.key),
    label: localized(group.label, locale, group.key),
    mode: group.mode,
    renderer: group.renderer,
    required: group.required === true,
    default: selectedDefault,
    width: FORM_FIELD_WIDTH.full,
    members,
    options,
  };
}

function resolveField(
  ref: string,
  width: FormFieldWidth,
  input: ResolveInput,
  groups: ReadonlyMap<string, FormGroup>,
  customFields: ReadonlyMap<string, FormCustomField>,
  tickets: ReadonlyMap<string, ResolvedTicketType>,
): ResolvedField | null {
  if (ref === FORM_REF.fullName) {
    return {
      kind: FORM_FIELD_KIND.fullName,
      ref,
      width,
      label: nullableLocalized(input.schema.overrides?.fullName?.label, input.locale),
      help: nullableLocalized(input.schema.overrides?.fullName?.help, input.locale),
      placeholder: nullableLocalized(input.schema.overrides?.fullName?.placeholder, input.locale),
      required: true,
    };
  }

  if (ref === FORM_REF.consent) {
    return {
      kind: FORM_FIELD_KIND.consent,
      ref,
      width,
      label: nullableLocalized(input.schema.overrides?.consent?.label, input.locale),
      help: nullableLocalized(input.schema.overrides?.consent?.help, input.locale),
      placeholder: null,
      required: true,
    };
  }

  if (ref === FORM_REF.confirmation) {
    return {
      kind: FORM_FIELD_KIND.confirmation,
      ref,
      width: FORM_FIELD_WIDTH.full,
      mode: input.schema.contacts.confirmation.mode,
      methods: input.schema.contacts.confirmation.methods.map((kind) => ({
        kind,
        label: contactLabel(kind, input.schema.contacts, input.locale),
      })),
    };
  }

  if (ref === FORM_REF.contactEmail || ref === FORM_REF.contactPhone) {
    return resolveContactField(
      ref === FORM_REF.contactEmail ? CONTACT_KIND.email : CONTACT_KIND.phone,
      input.schema.contacts,
      input.locale,
      width,
    );
  }

  if (ref === FORM_REF.contactMail) {
    return resolveMailField(input.schema.contacts, input.locale);
  }

  if (isSystemTicketRef(ref)) {
    const ticket = tickets.get(refKey(ref, FORM_REF_PREFIX.tickets) ?? "");

    return ticket === undefined ? null : { kind: FORM_FIELD_KIND.ticket, ref, width, ticket };
  }

  if (isGroupRef(ref)) {
    const group = groups.get(refKey(ref, FORM_REF_PREFIX.group) ?? "");

    return group === undefined
      ? null
      : {
          kind: FORM_FIELD_KIND.group,
          ref,
          width: FORM_FIELD_WIDTH.full,
          group: resolveGroup(group, input.schema.contacts, customFields, input.locale),
        };
  }

  if (isCustomRef(ref)) {
    const field = customFields.get(refKey(ref, FORM_REF_PREFIX.custom) ?? "");

    return field === undefined ? null : resolveCustomField(field, input.locale, width);
  }

  return null;
}

function clientConfig(
  input: ResolveInput,
  tickets: ResolvedTicketType[],
  groups: ResolvedGroup[],
  customFields: ResolvedCustomField[],
  action: string,
): EngineClientConfig {
  const conditions: EngineClientConfig["conditions"] = {};

  for (const field of customFields) {
    if (field.visibleWhen !== null || field.requiredWhen !== null) {
      conditions[field.ref] = {
        visibleWhen: field.visibleWhen,
        requiredWhen: field.requiredWhen,
      };
    }
  }

  return {
    locale: input.locale,
    action,
    formVersion: input.formVersion,
    tickets: tickets.map((ticket) => ({
      key: ticket.key,
      min: ticket.minPerRegistration,
      max: ticket.maxPerRegistration,
      defaultQuantity: ticket.defaultQuantity,
      remaining: ticket.remaining,
    })),
    maxTicketsPerRegistration: input.event.limits.maxTicketsPerRegistration,
    maxTotalTickets: input.event.limits.maxTotalTickets,
    remainingTotal:
      input.event.limits.maxTotalTickets === null
        ? null
        : Math.max(input.event.limits.maxTotalTickets - input.event.ticketsTotal, 0),
    contacts: {
      email: { required: input.schema.contacts.email.required === true },
      phone: { required: input.schema.contacts.phone.required === true },
      mail: { required: input.schema.contacts.mail.required === true },
    },
    confirmation: {
      mode: input.schema.contacts.confirmation.mode,
      methods: input.schema.contacts.confirmation.methods,
    },
    groups: groups.map((group) => ({
      key: group.key,
      mode: group.mode,
      renderer: group.renderer,
      members: group.members.map((member) => member.ref),
      required: group.required,
      default: group.default,
    })),
    customFields: customFields.map((field) => ({
      key: field.key,
      type: field.type,
      required: field.required,
      options: field.options.map((option) => option.value),
      minLength: field.minLength,
      maxLength: field.maxLength,
      min: field.min,
      max: field.max,
      step: field.step,
      defaultValue: field.defaultValue,
    })),
    conditions,
  };
}

export function resolveRegistrationForm(input: ResolveInput): ResolvedRegistrationForm {
  const groups = new Map((input.schema.groups ?? []).map((group) => [group.key, group]));
  const customFields = new Map(
    (input.schema.customFields ?? []).map((field) => [field.key, field]),
  );
  const tickets = new Map(
    activeTicketTypes(input.event).map((ticketType) => [
      ticketType.key,
      resolveTicket(
        ticketType,
        input.locale,
        input.event.limits.currency,
        input.event.defaultLocale,
      ),
    ]),
  );
  const ticketList = [...tickets.values()];
  const resolvedGroups = (input.schema.groups ?? []).map((group) =>
    resolveGroup(group, input.schema.contacts, customFields, input.locale),
  );
  const customFieldList = (input.schema.customFields ?? []).map((field) =>
    resolveCustomField(field, input.locale, FORM_FIELD_WIDTH.full),
  );
  const fieldsBySection = new Map<
    string,
    { ref: string; order: number; width: FormFieldWidth }[]
  >();

  for (const field of input.schema.fields) {
    const fields = fieldsBySection.get(field.section) ?? [];

    fields.push({ ref: field.ref, order: field.order, width: field.width });
    fieldsBySection.set(field.section, fields);
  }

  const sections: ResolvedSection[] = input.schema.sections
    .toSorted((left, right) => left.order - right.order || left.key.localeCompare(right.key))
    .map((section) => {
      const placements = (fieldsBySection.get(section.key) ?? []).toSorted(
        (left, right) => left.order - right.order || left.ref.localeCompare(right.ref),
      );
      const fields = placements
        .map((placement) =>
          resolveField(placement.ref, placement.width, input, groups, customFields, tickets),
        )
        .filter((field): field is ResolvedField => field !== null);

      return {
        key: section.key,
        label: localized(section.label, input.locale, section.key),
        description: nullableLocalized(section.description, input.locale),
        fields,
      };
    });
  const action = `/api/events/public/events/${encodeURIComponent(input.event.slug)}/registrations`;

  return {
    event: {
      id: input.event.id,
      slug: input.event.slug,
      status: input.event.status,
      title: localized(
        input.event.title,
        input.locale,
        input.event.slug,
        input.event.defaultLocale,
      ),
      summary: localized(input.event.summary, input.locale, "", input.event.defaultLocale),
      startsAt: input.event.startsAt,
      endsAt: input.event.endsAt,
      timezone: input.event.timezone,
      location: input.event.location,
      payments: input.event.payments,
      notes:
        input.event.notes[input.locale] ??
        input.event.notes[input.event.defaultLocale] ??
        input.event.notes[DEFAULT_LOCALE] ??
        Object.values(input.event.notes)[0] ??
        [],
      registrationOpen: input.event.registrationOpen,
    },
    formVersion: input.formVersion,
    locale: input.locale,
    sections,
    tickets: ticketList,
    contacts: {
      [CONTACT_KIND.email]: resolveContactConfig(
        input.schema.contacts.email,
        input.locale,
        CONTACT_KIND.email,
      ),
      [CONTACT_KIND.phone]: resolveContactConfig(
        input.schema.contacts.phone,
        input.locale,
        CONTACT_KIND.phone,
      ),
      [CONTACT_KIND.mail]: resolveContactConfig(
        input.schema.contacts.mail,
        input.locale,
        CONTACT_KIND.mail,
      ),
      confirmation: {
        mode: input.schema.contacts.confirmation.mode,
        methods: input.schema.contacts.confirmation.methods.map((kind) => ({
          kind,
          label: contactLabel(kind, input.schema.contacts, input.locale),
        })),
      },
    },
    groups: resolvedGroups,
    customFields: customFieldList,
    submit: { action },
    client: clientConfig(input, ticketList, resolvedGroups, customFieldList, action),
  };
}
