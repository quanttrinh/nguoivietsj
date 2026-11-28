// @boundary client
import type { ComponentChildren, JSX } from "preact";

import type { ResolvedRegistrationForm } from "~/features/events/domain/form-schema/resolve/resolve";
import { safeExternalUrl } from "~/features/events/domain/url";
import { dateTimeFormatter, formatMoney } from "~/platform/utils/format";

import { styles } from "../shared/registration-styles";
import type { PublicRegistrationConfig } from "../shared/registration-types";

export function InfoRow({
  term,
  children,
}: {
  term: string;
  children: ComponentChildren;
}): JSX.Element {
  return (
    <div class={styles.infoRow}>
      <dt class={styles.infoTerm}>{term}</dt>
      <dd class={styles.infoValue}>{children}</dd>
    </div>
  );
}
export function InfoBlock({
  form,
  config,
}: {
  form: ResolvedRegistrationForm;
  config: PublicRegistrationConfig;
}): JSX.Element {
  const formatter = dateTimeFormatter(config.locale, form.event.timezone);
  const startsAt =
    form.event.startsAt === null ? null : formatter.format(new Date(form.event.startsAt));
  const endsAt = form.event.endsAt === null ? null : formatter.format(new Date(form.event.endsAt));
  let when: string | null = null;

  if (startsAt !== null) {
    when = endsAt === null || endsAt === startsAt ? startsAt : `${startsAt} – ${endsAt}`;
  }

  const payment = form.event.payments;
  const missingPaymentMethod = !(payment.etransfer.enabled || payment.cash.enabled);

  return (
    <qui-accordion multiple class={styles.accordion}>
      <qui-accordion-item value="details">
        <qui-accordion-trigger>
          {config.labels.engineRegistration.info.details}
        </qui-accordion-trigger>
        <qui-accordion-content>
          <dl class={styles.infoRows}>
            {when && <InfoRow term={config.labels.engineRegistration.event.when}>{when}</InfoRow>}
            <InfoRow term={config.labels.shared.location}>
              {form.event.location.name.length > 0 || form.event.location.address.length > 0 ? (
                <>
                  {form.event.location.name.length > 0 ? (
                    <div>{form.event.location.name}</div>
                  ) : null}
                  {form.event.location.address.length > 0 ? (
                    <div>{form.event.location.address}</div>
                  ) : null}
                </>
              ) : (
                <span class={styles.infoMuted}>
                  {config.labels.engineRegistration.info.venueTba}
                </span>
              )}
            </InfoRow>
          </dl>
        </qui-accordion-content>
      </qui-accordion-item>

      {form.tickets.length > 0 ? (
        <qui-accordion-item value="pricing">
          <qui-accordion-trigger>
            {config.labels.engineRegistration.info.pricing}
          </qui-accordion-trigger>
          <qui-accordion-content>
            <div class={styles.ticketList}>
              {form.tickets.map((ticket) => (
                <div key={ticket.key} class={styles.ticketRow}>
                  <div>
                    <p class={styles.ticketName}>{ticket.label}</p>
                    {ticket.remaining === null ? null : (
                      <p class={styles.ticketMeta}>
                        {ticket.remaining === 0
                          ? config.labels.engineRegistration.event.soldOut
                          : `${config.labels.engineRegistration.event.remainingParts[0]}${ticket.remaining}${config.labels.engineRegistration.event.remainingParts[1]}`}
                      </p>
                    )}
                  </div>
                  <p class={styles.ticketPrice}>
                    {ticket.priceMinor === 0
                      ? config.labels.engineRegistration.event.free
                      : formatMoney(ticket.priceMinor, config.locale, ticket.currency)}
                  </p>
                </div>
              ))}
            </div>
          </qui-accordion-content>
        </qui-accordion-item>
      ) : null}

      <qui-accordion-item value="payment">
        <qui-accordion-trigger>{config.labels.shared.payment}</qui-accordion-trigger>
        <qui-accordion-content>
          <div class={styles.chips}>
            {form.event.payments.etransfer.enabled ? (
              <span class={styles.chip}>{config.labels.shared.eTransfer}</span>
            ) : null}
            {form.event.payments.cash.enabled ? (
              <span class={styles.chip}>{config.labels.shared.cash}</span>
            ) : null}
            {missingPaymentMethod ? (
              <span class={styles.infoMuted}>
                {config.labels.engineRegistration.info.paymentNotConfigured}
              </span>
            ) : null}
          </div>
        </qui-accordion-content>
      </qui-accordion-item>

      {form.event.notes.length > 0 ? (
        <qui-accordion-item value="notes">
          <qui-accordion-trigger>
            {config.labels.engineRegistration.info.notes}
          </qui-accordion-trigger>
          <qui-accordion-content>
            <div class={styles.info}>
              {form.event.notes.map((note) => {
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
