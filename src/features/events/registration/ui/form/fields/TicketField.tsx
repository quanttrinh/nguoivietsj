// @boundary client
import type { JSX } from "preact";

import { ticketFieldName } from "~/features/events/domain/form-schema/refs";
import type {
  ResolvedTicketField,
  ResolvedTicketType,
} from "~/features/events/domain/form-schema/resolve/resolve";
import { MAX_TICKETS_PER_REGISTRATION } from "~/features/events/domain/limits";
import { formatMoney } from "~/platform/utils/format";

import type { PublicRegistrationConfig } from "../../shared/registration-types";
import type { FieldProps } from "./field-types";
import { TextField } from "./FieldPrimitives";

type TicketFieldProps = FieldProps<ResolvedTicketField>;

function ticketHelper(ticket: ResolvedTicketType, config: PublicRegistrationConfig) {
  const parts = [
    ticket.priceMinor === 0
      ? config.labels.engineRegistration.event.free
      : formatMoney(ticket.priceMinor, config.locale, ticket.currency),
  ];

  if (ticket.remaining !== null) {
    parts.push(
      ticket.remaining === 0
        ? config.labels.engineRegistration.event.soldOut
        : `${config.labels.engineRegistration.event.remainingParts[0]}${ticket.remaining}${config.labels.engineRegistration.event.remainingParts[1]}`,
    );
  }

  if (ticket.maxPerRegistration !== null) {
    parts.push(String(ticket.maxPerRegistration));
  }

  return parts.join(" · ");
}

export function TicketField({ field, config, error }: TicketFieldProps): JSX.Element {
  const ticket = field.ticket;
  const max = Math.min(
    ticket.maxPerRegistration ?? MAX_TICKETS_PER_REGISTRATION,
    ticket.remaining ?? Number.POSITIVE_INFINITY,
  );

  return (
    <TextField
      fieldRef={field.ref}
      label={ticket.label}
      required={false}
      name={ticketFieldName(ticket.key)}
      type="number"
      modeHint="numeric"
      min={ticket.minPerRegistration}
      max={max}
      step={1}
      defaultValue={String(ticket.defaultQuantity)}
      help={ticketHelper(ticket, config)}
      error={error}
      fallbackError={config.labels.engineRegistration.errors.required}
    />
  );
}
