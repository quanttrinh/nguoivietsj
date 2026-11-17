// @boundary client
import type { InputMode, InputType } from "@quanttrinh/qui";
import type { ComponentChildren, JSX } from "preact";

import { FORM_FIELD_KIND, FORM_FIELD_WIDTH } from "~/events/domain/form-schema/constants";
import { stripNulishProps } from "~/shared/client/strip-props";

import { styles } from "../../shared/registration-styles";

/** Stable DOM id for a field ref, safe for ids and attribute selectors. */
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

export interface FieldFrameProps {
  fieldRef: string;
  /** Omit or pass `null` when the control renders its own label. */
  label?: string | null;
  required: boolean;
  help?: string | null | undefined;
  /** Actual validation message; falls back to `fallbackError` when absent. */
  error?: string | undefined;
  fallbackError?: string | undefined;
  /** Override the default `error !== undefined` invalid state. */
  invalid?: boolean | undefined;
  class?: string | undefined;
  customType?: string | undefined;
  children: ComponentChildren;
}

/**
 * Standard shell for a single control: field wrapper, label, helper text, and
 * error message. Field implementations only supply their input element.
 */
export function FieldFrame(props: FieldFrameProps): JSX.Element {
  const invalid = props.invalid ?? props.error !== undefined;

  return (
    <qui-field
      id={domId(props.fieldRef)}
      data-field-ref={props.fieldRef}
      class={props.class}
      required={props.required}
      invalid={invalid}
      {...stripNulishProps({ "data-custom-type": props.customType })}
    >
      {props.label != null && <Label label={props.label} required={props.required} />}
      {props.children}
      {props.help && <qui-field-helper-text>{props.help}</qui-field-helper-text>}
      <ErrorText message={props.error ?? props.fallbackError ?? ""} />
    </qui-field>
  );
}

export interface FieldShellProps {
  fieldRef: string;
  kind: string;
  width?: string | undefined;
  visible?: boolean | undefined;
  children: ComponentChildren;
}

/** Layout wrapper that controls a field's grid span and visibility. */
export function FieldShell(props: FieldShellProps): JSX.Element {
  const wide = props.width === FORM_FIELD_WIDTH.full || props.kind === FORM_FIELD_KIND.group;
  const visible = props.visible ?? true;

  return (
    <div
      class={`${styles.field} ${wide ? styles.full : ""}`}
      data-ref={props.fieldRef}
      data-kind={props.kind}
      hidden={!visible}
      aria-hidden={!visible}
    >
      {props.children}
    </div>
  );
}

export interface TextFieldProps {
  fieldRef: string;
  label: string;
  required: boolean;
  name: string;
  placeholder?: string | undefined;
  help?: string | null | undefined;
  error?: string | undefined;
  fallbackError?: string | undefined;
  invalid?: boolean | undefined;
  type?: InputType | undefined;
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  defaultValue?: string | undefined;
  maxLength?: number | undefined;
  modeHint?: InputMode | undefined;
  autocomplete?: string | undefined;
}

/** Single-line text input with the standard field shell. */
export function TextField(props: TextFieldProps): JSX.Element {
  return (
    <FieldFrame
      fieldRef={props.fieldRef}
      label={props.label}
      required={props.required}
      help={props.help}
      error={props.error}
      fallbackError={props.fallbackError}
      invalid={props.invalid}
    >
      <qui-input
        name={props.name}
        required={props.required}
        {...stripNulishProps({
          placeholder: props.placeholder,
          defaultValue: props.defaultValue,
          autocomplete: props.autocomplete,
          inputType: props.type,
          inputModeHint: props.modeHint,
          min: props.min,
          max: props.max,
          step: props.step,
          maxLength: props.maxLength,
        })}
      />
    </FieldFrame>
  );
}
