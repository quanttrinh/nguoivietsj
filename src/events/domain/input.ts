import { CONTACT_KIND, DEFAULT_TIMEZONE, EVENT_STATUS } from "~/events/domain/constants";
import type {
  ContactInput,
  EventCreateInput,
  EventUpdateInput,
  RegistrationInput,
  TicketTypeInput,
} from "~/events/domain/types";
import type {
  EventCreateBody,
  EventUpdateBody,
  RegistrationBody,
  TicketTypeBody,
} from "~/events/domain/validation";
import { DEFAULT_LOCALE } from "~/shared/constants/locales";

export function toTicketTypeInput(type: TicketTypeBody): TicketTypeInput {
  return {
    ...type,
    description: type.description ?? null,
  };
}

export function toEventCreateInput(body: EventCreateBody): EventCreateInput {
  return {
    slug: body.slug,
    eventType: body.eventType,
    editionYear: body.editionYear,
    defaultLocale: body.defaultLocale ?? DEFAULT_LOCALE,
    aliases: body.aliases ?? [],
    title: body.title,
    summary: body.summary ?? {},
    startsAt: body.startsAt ?? null,
    endsAt: body.endsAt ?? null,
    timezone: body.timezone ?? DEFAULT_TIMEZONE,
    status: body.status ?? EVENT_STATUS.draft,
    enabled: body.enabled ?? false,
    registrationOpen: body.registrationOpen ?? false,
    limits: body.limits,
    location: {
      name: body.location?.name ?? "",
      address: body.location?.address ?? "",
      mapUrl: body.location?.mapUrl ?? null,
      mapEmbedUrl: body.location?.mapEmbedUrl ?? null,
    },
    payments: {
      etransfer: {
        enabled: body.payments?.etransfer.enabled ?? false,
        email: body.payments?.etransfer.email ?? null,
      },
      cash: {
        enabled: body.payments?.cash.enabled ?? false,
        address: body.payments?.cash.address ?? null,
        mapUrl: body.payments?.cash.mapUrl ?? null,
        mapEmbedUrl: body.payments?.cash.mapEmbedUrl ?? null,
      },
    },
    notes: body.notes ?? {},
    ticketTypes: body.ticketTypes.map(toTicketTypeInput),
  };
}

export function toEventUpdateInput(body: EventUpdateBody): EventUpdateInput {
  const input: EventUpdateInput = {};

  if (body.defaultLocale !== undefined) {
    input.defaultLocale = body.defaultLocale;
  }
  if (body.aliases !== undefined) {
    input.aliases = body.aliases;
  }
  if (body.title !== undefined) {
    input.title = body.title;
  }
  if (body.summary !== undefined) {
    input.summary = body.summary;
  }
  if (body.startsAt !== undefined) {
    input.startsAt = body.startsAt;
  }
  if (body.endsAt !== undefined) {
    input.endsAt = body.endsAt;
  }
  if (body.timezone !== undefined) {
    input.timezone = body.timezone;
  }
  if (body.status !== undefined) {
    input.status = body.status;
  }
  if (body.enabled !== undefined) {
    input.enabled = body.enabled;
  }
  if (body.registrationOpen !== undefined) {
    input.registrationOpen = body.registrationOpen;
  }
  if (body.limits !== undefined) {
    input.limits = body.limits;
  }
  if (body.location !== undefined) {
    input.location = {
      name: body.location.name,
      address: body.location.address,
      mapUrl: body.location.mapUrl ?? null,
      mapEmbedUrl: body.location.mapEmbedUrl ?? null,
    };
  }

  if (body.payments !== undefined) {
    input.payments = {
      etransfer: {
        enabled: body.payments.etransfer.enabled,
        email: body.payments.etransfer.email ?? null,
      },
      cash: {
        enabled: body.payments.cash.enabled,
        address: body.payments.cash.address ?? null,
        mapUrl: body.payments.cash.mapUrl ?? null,
        mapEmbedUrl: body.payments.cash.mapEmbedUrl ?? null,
      },
    };
  }

  if (body.notes !== undefined) {
    input.notes = body.notes;
  }

  return input;
}

export function toContactInput(contact: RegistrationBody["contacts"][number]): ContactInput {
  const base = {
    label: contact.label ?? null,
    isPrimary: contact.isPrimary ?? false,
    isConfirmation: contact.isConfirmation ?? false,
    value: contact.value ?? {},
  };

  if (contact.kind === CONTACT_KIND.email) {
    return {
      ...base,
      kind: CONTACT_KIND.email,
      email: contact.email,
      phone: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      province: null,
      postalCode: null,
      country: null,
    };
  }

  if (contact.kind === CONTACT_KIND.phone) {
    return {
      ...base,
      kind: CONTACT_KIND.phone,
      email: null,
      phone: contact.phone,
      addressLine1: null,
      addressLine2: null,
      city: null,
      province: null,
      postalCode: null,
      country: null,
    };
  }

  return {
    ...base,
    kind: CONTACT_KIND.mail,
    email: null,
    phone: null,
    addressLine1: contact.addressLine1,
    addressLine2: contact.addressLine2 ?? null,
    city: contact.city,
    province: contact.province,
    postalCode: contact.postalCode,
    country: contact.country ?? "CA",
  };
}

export function toRegistrationInput(body: RegistrationBody): RegistrationInput {
  return {
    fullName: body.fullName,
    contacts: body.contacts.map(toContactInput),
    tickets: body.tickets.map((ticket) => ({
      key: ticket.key,
      quantity: ticket.quantity,
    })),
    consent: body.consent,
    formVersion: body.formVersion ?? null,
    answers: body.answers ?? {},
    metadata: body.metadata ?? {},
  };
}
