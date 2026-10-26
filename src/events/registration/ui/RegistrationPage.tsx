/* oxlint-disable eslint/no-nested-ternary, unicorn/no-nested-ternary, eslint/no-negated-condition, unicorn/no-negated-condition -- Direct rendering keeps related state branches together. */
import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";

import type { ResolvedRegistrationForm } from "~/events/domain/form-schema/resolve/resolve";
import { stringifyJsonScript } from "~/shared/client/json-script";

import { Section } from "./fields/registration-field";
import { registrationRuntime } from "./registration-runtime";
import { styles } from "./registration-styles";
import type { PublicRegistrationConfig } from "./registration-types";
import { InfoBlock } from "./RegistrationInfo";

export function Page(props: {
  form: ResolvedRegistrationForm;
  config: PublicRegistrationConfig;
  preview?: boolean | undefined;
}): JSX.Element {
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    const form = formRef.current;

    if (form === null) {
      return;
    }

    void registrationRuntime().then((runtime) => {
      void runtime.mount(form);
      runtime.init();
    });
  }, []);

  const onFormRef = (element: HTMLFormElement | null): void => {
    formRef.current = element;
  };
  return (
    <section class={styles.section}>
      <div class={styles.hero}>
        <p class={styles.label}>{props.config.eyebrow}</p>
        <h1 class={styles.title}>{props.form.event.title}</h1>
        {props.form.event.summary.length > 0 ? (
          <p class={styles.lead}>{props.form.event.summary}</p>
        ) : null}
        <InfoBlock form={props.form} config={props.config} />
      </div>

      <div class={styles.panel}>
        <h2 id="engine-registration-heading" class={styles.cardTitle}>
          {props.config.formTitle}
        </h2>
        <p class={styles.cardDescription}>{props.config.formDescription}</p>

        {props.preview === true ? (
          <div class={styles.errorBox} role="status">
            {props.config.previewNotice}
          </div>
        ) : null}

        {props.form.event.registrationOpen ? (
          <form
            id="engine-registration-form"
            ref={onFormRef}
            class={styles.form}
            action={props.form.submit.action}
            method="post"
            aria-labelledby="engine-registration-heading"
            data-form-version={props.form.formVersion}
            data-preview={props.preview === true ? "true" : undefined}
            novalidate
          >
            <div id="engine-registration-notice" class={styles.notice} tabIndex={-1} hidden />
            <noscript class={styles.notice}>
              <p class={styles.text}>{props.config.noscript}</p>
            </noscript>

            {props.form.sections.map((section) => (
              <Section key={section.key} section={section} config={props.config} />
            ))}

            {props.preview !== true && props.config.turnstile.siteKey.length > 0 ? (
              <div
                class={styles.actions}
                data-turnstile
                data-sitekey={props.config.turnstile.siteKey}
                data-action={props.config.turnstile.action}
              />
            ) : null}

            <div
              id="engine-registration-success"
              class={styles.success}
              role="status"
              tabIndex={-1}
              hidden
            >
              <strong>{props.config.messages.successTitle}</strong>
              <br />
              {props.config.messages.successBody}
              <span class={styles.reference}>
                {props.config.successReference}: <code data-registration-reference />
              </span>
              <p class={styles.text}>{props.config.statusLookup}</p>
              <a
                class={styles.statusLink}
                href={`/${props.config.locale}/events/status`}
                data-registration-status
                hidden
              >
                {props.config.statusLink}
              </a>
            </div>

            {props.preview !== true ? (
              <div class={styles.actions}>
                <qui-button id="engine-registration-submit" variant="filled">
                  {props.config.submit}
                </qui-button>
              </div>
            ) : null}

            <script
              type="application/json"
              id="engine-registration-config"
              dangerouslySetInnerHTML={{
                __html: stringifyJsonScript(props.form.client),
              }}
            />
            <script
              type="application/json"
              id="engine-registration-messages"
              dangerouslySetInnerHTML={{
                __html: stringifyJsonScript(props.config.messages),
              }}
            />
          </form>
        ) : (
          <div class={styles.errorBox} role="alert">
            <strong>{props.config.registrationClosed}</strong>
            <br />
            {props.config.registrationClosedBody}
          </div>
        )}
      </div>
    </section>
  );
}
