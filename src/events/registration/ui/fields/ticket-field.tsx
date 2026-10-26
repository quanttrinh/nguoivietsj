/* oxlint-disable typescript/consistent-type-imports -- FORM_FIELD_KIND is used in a type query. */
import type { JSX } from "preact";

import { FORM_FIELD_KIND, ticketFieldName } from "~/events/domain/form-schema/constants";
import type {
  ResolvedField,
  ResolvedTicketType,
} from "~/events/domain/form-schema/resolve/resolve";
import { MAX_TICKETS_PER_REGISTRATION } from "~/events/domain/limits";
import { formatMoney } from "~/shared/utils/format";

import type { PublicRegistrationConfig } from "../registration-types";
import { TextField } from "./field-primitives";

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
export function TicketField(props: {
  field: Extract<ResolvedField, { kind: typeof FORM_FIELD_KIND.ticket }>;
  config: PublicRegistrationConfig;
}): JSX.Element {
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
      error={props.config.messages.required}
    />
  );
}
