import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import type { ResolvedRegistrationForm } from "~/events/domain/form-schema/resolve/resolve";
import { readCachedJson } from "~/shared/client/data-cache";

import { registrationEndpoint } from "./registration-endpoints";
import { registrationRuntime } from "./registration-runtime";
import { styles } from "./registration-styles";
import type { Props } from "./registration-types";
import { Page } from "./RegistrationPage";

interface PublicEventResponse {
  form?: ResolvedRegistrationForm | null;
}

export default function PublicRegistration(props: Props): JSX.Element | null {
  const [form, setForm] = useState<ResolvedRegistrationForm | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void registrationRuntime();
    const params = new URLSearchParams(globalThis.location.search);
    const endpoint = registrationEndpoint(props, params);
    if (endpoint === null) {
      setLoading(false);
      return;
    }
    const cached = readCachedJson<PublicEventResponse>(endpoint);
    if (cached !== null) {
      setForm(cached.form ?? null);
      setLoading(false);
      if (cached.form !== undefined && cached.form !== null) {
        document.title = `${cached.form.event.title} · ${props.config.formTitle}`;
      }
    }
    void (async (): Promise<void> => {
      try {
        const response = await fetch(endpoint, {
          headers: {
            accept: "application/json",
          },
        });
        if (!response.ok) {
          throw new Error(String(response.status));
        }
        const payload = (await response.json()) as PublicEventResponse;
        setForm(payload.form ?? null);
        if (payload.form !== undefined && payload.form !== null) {
          document.title = `${payload.form.event.title} · ${props.config.formTitle}`;
        }
      } catch (error) {
        console.error(error);
        if (cached === null) {
          setForm(null);
        }
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
          <p class={styles.cardDescription}>{props.config.unavailableBody}</p>
        </div>
      </section>
    );
  }

  return <Page form={form} config={props.config} preview={props.preview} />;
}
