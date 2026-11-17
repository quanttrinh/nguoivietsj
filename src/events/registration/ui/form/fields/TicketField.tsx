// @boundary client
import type { JSX } from "preact";

import { ticketFieldName } from "~/events/domain/form-schema/constants";
import type {
  ResolvedTicketField,
  ResolvedTicketType,
} from "~/events/domain/form-schema/resolve/resolve";
import { MAX_TICKETS_PER_REGISTRATION } from "~/events/domain/limits";
import { formatMoney } from "~/shared/utils/format";

import type { PublicRegistrationConfig } from "../../shared/registration-types";
import type { FieldProps } from "./field-types";
import { TextField } from "./FieldPrimitives";

export type TicketFieldProps = FieldProps<ResolvedTicketField>;

function ticketHelper(ticket: ResolvedTicketType, config: PublicRegistrationConfig): string {
  const parts = [
    ticket.priceMinor === 0
      ? config.free
      : formatMoney(ticket.priceMinor, config.locale, ticket.currency),
  ];

  if (ticket.remaining !== null) {
    parts.push(
      ticket.remaining === 0
        ? config.soldOut
        : `${config.remainingParts[0] ?? ""}${ticket.remaining}${config.remainingParts[1] ?? ""}`,
    );
  }

  if (ticket.maxPerRegistration !== null) {
    parts.push(String(ticket.maxPerRegistration));
  }

  return parts.join(" · ");
}

export function TicketField(props: TicketFieldProps): JSX.Element {
  const ticket = props.field.ticket;
  const max = Math.min(
    ticket.maxPerRegistration ?? MAX_TICKETS_PER_REGISTRATION,
    ticket.remaining ?? Number.POSITIVE_INFINITY,
  );

  return (
    <TextField
      fieldRef={props.field.ref}
      label={ticket.label}
      required={false}
      name={ticketFieldName(ticket.key)}
      type="number"
      modeHint="numeric"
      min={ticket.minPerRegistration}
      max={max}
      step={1}
      defaultValue={String(ticket.defaultQuantity)}
      help={ticketHelper(ticket, props.config)}
      error={props.error}
      fallbackError={props.config.messages.required}
    />
  );
}
