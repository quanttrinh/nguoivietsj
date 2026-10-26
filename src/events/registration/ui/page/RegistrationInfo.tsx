// @boundary client
import { type ComponentChildren, type JSX } from "preact";

import { type ResolvedRegistrationForm } from "~/events/domain/form-schema/resolve/resolve";
import { dateTimeFormatter, formatMoney } from "~/shared/utils/format";
import { safeExternalUrl } from "~/shared/utils/url";

import { styles } from "../shared/registration-styles";
import { type PublicRegistrationConfig } from "../shared/registration-types";

export function InfoRow(props: { term: string; children: ComponentChildren }): JSX.Element {
  return (
    <div class={styles.infoRow}>
      <dt class={styles.infoTerm}>{props.term}</dt>
      <dd class={styles.infoValue}>{props.children}</dd>
    </div>
  );
}
export function InfoBlock(props: {
  form: ResolvedRegistrationForm;
  config: PublicRegistrationConfig;
}): JSX.Element {
  const formatter = dateTimeFormatter(props.config.locale, props.form.event.timezone);
  const startsAt =
    props.form.event.startsAt === null
      ? null
      : formatter.format(new Date(props.form.event.startsAt));
  const endsAt =
    props.form.event.endsAt === null ? null : formatter.format(new Date(props.form.event.endsAt));
  let when: string | null = null;

  if (startsAt !== null) {
    when = endsAt === null || endsAt === startsAt ? startsAt : `${startsAt} – ${endsAt}`;
  }

  const payment = props.form.event.payments;
  const missingPaymentMethod = !(payment.etransfer.enabled || payment.cash.enabled);

  return (
    <qui-accordion multiple class={styles.accordion}>
      <qui-accordion-item value="details">
        <qui-accordion-trigger>{props.config.detailsLabel}</qui-accordion-trigger>
        <qui-accordion-content>
          <dl class={styles.infoRows}>
            {when && <InfoRow term={props.config.when}>{when}</InfoRow>}
            <InfoRow term={props.config.location}>
              {props.form.event.location.name.length > 0 ||
              props.form.event.location.address.length > 0 ? (
                <>
                  {props.form.event.location.name.length > 0 ? (
                    <div>{props.form.event.location.name}</div>
                  ) : null}
                  {props.form.event.location.address.length > 0 ? (
                    <div>{props.form.event.location.address}</div>
                  ) : null}
                </>
              ) : (
                <span class={styles.infoMuted}>{props.config.venueTba}</span>
              )}
            </InfoRow>
          </dl>
        </qui-accordion-content>
      </qui-accordion-item>

      {props.form.tickets.length > 0 ? (
        <qui-accordion-item value="pricing">
          <qui-accordion-trigger>{props.config.pricing}</qui-accordion-trigger>
          <qui-accordion-content>
            <div class={styles.ticketList}>
              {props.form.tickets.map((ticket) => (
                <div key={ticket.key} class={styles.ticketRow}>
                  <div>
                    <p class={styles.ticketName}>{ticket.label}</p>
                    {ticket.remaining === null ? null : (
                      <p class={styles.ticketMeta}>
                        {ticket.remaining === 0
                          ? props.config.soldOut
                          : `${props.config.remainingParts[0] ?? ""}${ticket.remaining}${props.config.remainingParts[1] ?? ""}`}
                      </p>
                    )}
                  </div>
                  <p class={styles.ticketPrice}>
                    {ticket.priceMinor === 0
                      ? props.config.free
                      : formatMoney(ticket.priceMinor, props.config.locale, ticket.currency)}
                  </p>
                </div>
              ))}
            </div>
          </qui-accordion-content>
        </qui-accordion-item>
      ) : null}

      <qui-accordion-item value="payment">
        <qui-accordion-trigger>{props.config.payment}</qui-accordion-trigger>
        <qui-accordion-content>
          <div class={styles.chips}>
            {props.form.event.payments.etransfer.enabled ? (
              <span class={styles.chip}>{props.config.etransfer}</span>
            ) : null}
            {props.form.event.payments.cash.enabled ? (
              <span class={styles.chip}>{props.config.cash}</span>
            ) : null}
            {missingPaymentMethod ? (
              <span class={styles.infoMuted}>{props.config.paymentNotConfigured}</span>
            ) : null}
          </div>
        </qui-accordion-content>
      </qui-accordion-item>

      {props.form.event.notes.length > 0 ? (
        <qui-accordion-item value="notes">
          <qui-accordion-trigger>{props.config.notes}</qui-accordion-trigger>
          <qui-accordion-content>
            <div class={styles.info}>
              {props.form.event.notes.map((note) => {
                if (note.type === "paragraph") {
                  return (
                    <p key={`paragraph-${note.text}`} class={styles.infoValue}>
                      {note.text}
                    </p>
                  );
                }

                if (note.type === "bullets") {
                  return (
                    <ul key={`bullets-${note.items.join("|")}`} class={styles.noteList}>
                      {note.items.map((item) => (
                        <li key={item} class={styles.noteItem}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  );
                }

                const href = safeExternalUrl(note.href);

                return href === null ? (
                  <span key={`link-${note.href}`} class={styles.infoValue}>
                    {note.label}
                  </span>
                ) : (
                  <a
                    key={`link-${note.href}`}
                    class={styles.statusLink}
                    href={href}
                    rel="noopener noreferrer"
                  >
                    {note.label}
                  </a>
                );
              })}
            </div>
          </qui-accordion-content>
        </qui-accordion-item>
      ) : null}
    </qui-accordion>
  );
}
