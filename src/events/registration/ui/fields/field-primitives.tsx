import type { ComponentChildren, JSX } from "preact";

import { FORM_FIELD_KIND, FORM_FIELD_WIDTH } from "~/events/domain/form-schema/constants";

import { styles } from "../registration-styles";

export function domId(ref: string): string {
  return `field-${ref.replaceAll(".", "-").replaceAll(/[^a-zA-Z0-9_-]/gu, "-")}`;
}
export function ErrorText(props: { message: string }): JSX.Element {
  return (
    <qui-field-error-text>
      <span data-error-message>{props.message}</span>
    </qui-field-error-text>
  );
}
export function Label(props: { label: string; required?: boolean }): JSX.Element {
  return (
    <qui-field-label>
      {props.label}
      {props.required === true ? <qui-field-required-indicator /> : null}
    </qui-field-label>
  );
}
export function FieldShell(props: {
  fieldRef: string;
  kind: string;
  width?: string;
  children: ComponentChildren;
}): JSX.Element {
  const wide = (): boolean =>
    props.width === FORM_FIELD_WIDTH.full || props.kind === FORM_FIELD_KIND.group;
  return (
    <div
      class={`${styles.field} ${wide() ? styles.full : ""}`}
      data-ref={props.fieldRef}
      data-kind={props.kind}
    >
      {props.children}
    </div>
  );
}
export function TextField(props: {
  fieldRef: string;
  label: string;
  required: boolean;
  name: string;
  placeholder?: string;
  help?: string | null;
  error: string;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: string;
  maxLength?: number;
  modeHint?: string;
  autocomplete?: string;
}): JSX.Element {
  return (
    <qui-field
      id={domId(props.fieldRef)}
      data-field-ref={props.fieldRef}
      required={props.required || undefined}
    >
      <Label label={props.label} required={props.required} />
      <qui-input
        name={props.name}
        input-type={props.type}
        input-mode-hint={props.modeHint}
        autocomplete={props.autocomplete}
        placeholder={props.placeholder}
        min={props.min}
        max={props.max}
        step={props.step}
        max-length={props.maxLength}
        default-value={props.defaultValue}
        required={props.required || undefined}
      />
      {props.help !== undefined && props.help !== null ? (
        <qui-field-helper-text>{props.help}</qui-field-helper-text>
      ) : null}
      <ErrorText message={props.error} />
    </qui-field>
  );
}
