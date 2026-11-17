// @boundary client
import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import type { ResolvedRegistrationForm } from "~/events/domain/form-schema";
import { apiClient, apiErrorMessage, readApiJson } from "~/shared/client/api/client";
import { clientLogger } from "~/shared/client/logger";

import { Page } from "./page/RegistrationPage";
import { registrationRequest } from "./shared/registration-endpoints";
import { styles } from "./shared/registration-styles";
import type { Props } from "./shared/registration-types";

const getPublicEvent = apiClient.api.events[":slug"].$get;
const getPreview = apiClient.api.admin.events[":eventId"].preview.$get;

type RegistrationRequest = NonNullable<ReturnType<typeof registrationRequest>>;

/**
 * Hono serializes responses through `JSONParsed<T>`, which TypeScript treats as
 * a distinct type from the server's `ResolvedRegistrationForm`. Keep the one
 * unavoidable assertion at this API boundary instead of spreading it into UI.
 */
function asResolvedRegistrationForm(value: unknown): ResolvedRegistrationForm | null {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Hono's JSONParsed transport type is structurally equivalent but not identical.
  return value as ResolvedRegistrationForm | null;
}

/** Load the same resolved form shape from either the public or preview endpoint. */
async function loadRegistrationForm(
  request: RegistrationRequest,
): Promise<ResolvedRegistrationForm | null> {
  if (request.kind === "public") {
    const payload = await readApiJson(
      await getPublicEvent({
        param: { slug: request.slug },
        query: { locale: request.locale },
      }),
    );

    return asResolvedRegistrationForm(payload.data.form);
  }

  const payload = await readApiJson(
    await getPreview({
      param: { eventId: request.eventId },
      query: {
        locale: request.locale,
        ...(request.version === null ? {} : { version: request.version }),
      },
    }),
  );

  return asResolvedRegistrationForm(payload.data.form);
}

export default function PublicRegistration(props: Props): JSX.Element | null {
  const [form, setForm] = useState<ResolvedRegistrationForm | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const params = new URLSearchParams(globalThis.location.search);
    const request = registrationRequest(props, params);
    if (request === null) {
      setLoading(false);
      return;
    }
    void (async (): Promise<void> => {
      try {
        const resolvedForm = await loadRegistrationForm(request);
        setForm(resolvedForm);
        if (resolvedForm !== null) {
          document.title = `${resolvedForm.event.title} · ${props.config.formTitle}`;
        }
      } catch (error) {
        clientLogger.error(error);
        setForm(null);
        setErrorMessage(apiErrorMessage(error, props.config.unavailableBody));
      } finally {
        setLoading(false);
      }
    })();
  }, [props]);

  if (loading) {
    return null;
  }

  if (form === null) {
    return (
      <section class={styles.section}>
        <div class={styles.panel}>
          <h1 class={styles.title}>{props.config.unavailable}</h1>
          <p class={styles.cardDescription}>{errorMessage ?? props.config.unavailableBody}</p>
        </div>
      </section>
    );
  }

  return <Page form={form} config={props.config} preview={props.preview} staff={props.staff} />;
}
