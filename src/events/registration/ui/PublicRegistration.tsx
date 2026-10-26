// @boundary client
import { type JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { type ResolvedRegistrationForm } from "~/events/domain/form-schema/resolve/resolve";
import { apiClient, apiErrorMessage, readApiJson } from "~/shared/client/api/client";
import { clientLogger } from "~/shared/client/logger";

import { Page } from "./page/RegistrationPage";
import { registrationRequest } from "./shared/registration-endpoints";
import { styles } from "./shared/registration-styles";
import { type Props } from "./shared/registration-types";

const getPublicEvent = apiClient.api.events[":slug"].$get;
const getPreview = apiClient.api.admin.events[":eventId"].preview.$get;
interface FormResponse {
  data: { form: ResolvedRegistrationForm | null };
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
        const payload: FormResponse =
          request.kind === "public"
            ? await readApiJson(
                await getPublicEvent({
                  param: { slug: request.slug },
                  query: { locale: request.locale },
                }),
              )
            : await readApiJson(
                await getPreview({
                  param: { eventId: request.eventId },
                  query: {
                    locale: request.locale,
                    ...(request.version === null ? {} : { version: request.version }),
                  },
                }),
              );
        setForm(payload.data.form ?? null);
        if (payload.data.form != null) {
          document.title = `${payload.data.form.event.title} · ${props.config.formTitle}`;
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
