/* oxlint-disable eslint/max-params -- Resolver helpers take explicit locale/schema context. */

import { localized, nullableLocalized } from "~/events/domain/localized";
import type { EventDetail, TicketTypeRecord } from "~/events/domain/types";

export interface ResolvedTicketType {
  key: string;
  label: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  minPerRegistration: number;
  maxPerRegistration: number | null;
  defaultQuantity: number;
  capacity: number | null;
  remaining: number | null;
  sortOrder: number;
}

export function activeTicketTypes(event: EventDetail): TicketTypeRecord[] {
  return event.ticketTypes
    .filter((ticketType) => ticketType.active)
    .toSorted(
      (left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key),
    );
}

export function resolveTicket(
  ticketType: TicketTypeRecord,
  locale: string,
  currency: string,
  defaultLocale: string,
): ResolvedTicketType {
  return {
    key: ticketType.key,
    label: localized(ticketType.label, locale, ticketType.key, defaultLocale),
    description: nullableLocalized(ticketType.description ?? undefined, locale, defaultLocale),
    priceMinor: ticketType.priceMinor,
    currency,
    minPerRegistration: ticketType.minPerRegistration,
    maxPerRegistration: ticketType.maxPerRegistration,
    defaultQuantity: ticketType.defaultQuantity,
    capacity: ticketType.capacity,
    remaining:
      ticketType.capacity === null
        ? null
        : Math.max(ticketType.capacity - ticketType.ticketsSold, 0),
    sortOrder: ticketType.sortOrder,
  };
}
