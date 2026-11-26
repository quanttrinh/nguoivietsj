// @boundary client
import type { JSX } from "preact";
import { useState } from "preact/hooks";

import { vstack, wrap } from "styled-system/patterns";
import { adminRefresh } from "~/events/admin/ui/shared/queries";
import { MAX_PAYMENT_NOTE_LENGTH } from "~/events/domain/limits";
import type { PaymentRecord } from "~/events/domain/types";
import type { PaymentFormLabels } from "~/generated/client/PaymentForm";
import { apiClient, apiErrorMessage, readApiJson } from "~/shared/client/api/client";
import { readFormValue } from "~/shared/client/form-controls";
import { clientLogger } from "~/shared/client/logger";

export type { PaymentFormLabels } from "~/generated/client/PaymentForm";

export type PaymentResultKind = "saved" | "removed" | "email_failed" | "failed";

export interface PaymentResult {
  kind: PaymentResultKind;
  message: string;
  tone: "success" | "error";
}

const styles = {
  form: vstack({ alignItems: "stretch", gap: "2", minW: "48", maxW: "64" }),
  field: vstack({ alignItems: "stretch", gap: "1.5" }),
  actions: wrap({ alignItems: "center", gap: "3" }),
};

const updatePayment =
  apiClient.api.admin.events[":eventId"].registrations[":registrationId"].payment.$post;
const removePaymentRecord =
  apiClient.api.admin.events[":eventId"].registrations[":registrationId"].payment.$delete;

export default function PaymentForm({
  eventId,
  registrationId,
  payment,
  labels,
  onResult,
}: {
  eventId: string;
  registrationId: string;
  payment: PaymentRecord | null;
  labels: PaymentFormLabels;
  onResult?: (result: PaymentResult) => void;
}): JSX.Element {
  const [method, setMethod] = useState<"cash" | "etransfer" | "other">(payment?.method ?? "cash");
  const [pending, setPending] = useState(false);

  function report(kind: PaymentResultKind, message: string, tone: PaymentResult["tone"]) {
    onResult?.({ kind, message, tone });
  }

  async function save(event: Event) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!(form instanceof HTMLFormElement) || pending) {
      report("failed", labels.engineAdmin.paymentFailed, "error");
      return;
    }

    const nextMethod = readFormValue(form, "method").trim();
    const note = readFormValue(form, "note").trim();

    if (nextMethod !== "cash" && nextMethod !== "etransfer" && nextMethod !== "other") {
      report("failed", labels.engineAdmin.paymentFailed, "error");
      return;
    }
    if (nextMethod === "other" && note.length === 0) {
      report("failed", labels.engineAdmin.paymentNoteRequired, "error");
      return;
    }

    setPending(true);
    try {
      const body = await readApiJson(
        await updatePayment({
          param: { eventId, registrationId },
          json: { method: nextMethod, note: note || null },
        }),
      );

      adminRefresh.afterPaymentWrite(eventId);

      if (body.data.created && !body.data.emailQueued) {
        report("email_failed", labels.engineAdmin.paymentEmailFailed, "error");
      } else {
        report("saved", labels.engineAdmin.paymentSaved, "success");
      }
    } catch (error) {
      clientLogger.error(error);
      report("failed", apiErrorMessage(error, labels.engineAdmin.paymentFailed), "error");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    // oxlint-disable-next-line eslint/no-alert -- Removing a payment needs confirmation.
    if (pending || !globalThis.confirm(labels.engineAdmin.removePaymentConfirm)) {
      return;
    }

    setPending(true);
    try {
      await readApiJson(await removePaymentRecord({ param: { eventId, registrationId } }));

      adminRefresh.afterPaymentWrite(eventId);
      report("removed", labels.engineAdmin.paymentRemoved, "success");
    } catch (error) {
      clientLogger.error(error);
      report("failed", apiErrorMessage(error, labels.engineAdmin.paymentFailed), "error");
    } finally {
      setPending(false);
    }
  }

  const submitLabel = (() => {
    if (pending) {
      return labels.shared.saving;
    }
    return payment === null ? labels.engineAdmin.confirmPayment : labels.engineAdmin.updatePayment;
  })();

  return (
    <form
      class={styles.form}
      onSubmit={(event) => {
        void save(event);
      }}
    >
      <qui-field class={styles.field}>
        <qui-field-label>{labels.engineAdmin.paymentMethod}</qui-field-label>
        <qui-select
          name="method"
          defaultValue={[method]}
          onvaluechange={(event) => {
            const next = event.detail.value[0];
            setMethod(next === "cash" || next === "etransfer" || next === "other" ? next : "cash");
          }}
        >
          <qui-option value="cash">{labels.shared.cash}</qui-option>
          <qui-option value="etransfer">{labels.shared.eTransfer}</qui-option>
          <qui-option value="other">{labels.shared.other}</qui-option>
        </qui-select>
      </qui-field>
      <qui-field class={styles.field}>
        <qui-field-label>{labels.engineAdmin.paymentNote}</qui-field-label>
        <qui-input
          name="note"
          maxLength={MAX_PAYMENT_NOTE_LENGTH}
          required={method === "other"}
          defaultValue={payment?.note ?? ""}
        />
        {method === "other" ? (
          <qui-field-helper-text>{labels.engineAdmin.otherPaymentNoteHelp}</qui-field-helper-text>
        ) : null}
      </qui-field>
      <div class={styles.actions}>
        <qui-button type="submit" variant="outlined" disabled={pending}>
          {submitLabel}
        </qui-button>
        {payment === null ? null : (
          <qui-button
            type="button"
            variant="text"
            disabled={pending}
            onClick={() => {
              void remove();
            }}
          >
            {labels.engineAdmin.removePayment}
          </qui-button>
        )}
      </div>
    </form>
  );
}
