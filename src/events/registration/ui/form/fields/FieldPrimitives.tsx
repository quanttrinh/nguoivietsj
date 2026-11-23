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

export function ErrorText({ message }: { message: string }): JSX.Element {
  return (
    <qui-field-error-text>
      <span data-error-message>{message}</span>
    </qui-field-error-text>
  );
}

export function Label({ label, required }: { label: string; required?: boolean }): JSX.Element {
  return (
    <qui-field-label>
      {label}
      {required === true ? <qui-field-required-indicator /> : null}
    </qui-field-label>
  );
}

interface FieldFrameProps {
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
export function FieldFrame({
  fieldRef,
  label,
  required,
  help,
  error,
  fallbackError,
  invalid: invalidProp,
  class: className,
  customType,
  children,
}: FieldFrameProps): JSX.Element {
  const invalid = invalidProp ?? error !== undefined;

  return (
    <qui-field
      id={domId(fieldRef)}
      data-field-ref={fieldRef}
      class={className}
      required={required}
      invalid={invalid}
      {...stripNulishProps({ "data-custom-type": customType })}
    >
      {label != null && <Label label={label} required={required} />}
      {children}
      {help && <qui-field-helper-text>{help}</qui-field-helper-text>}
      <ErrorText message={error ?? fallbackError ?? ""} />
    </qui-field>
  );
}

interface FieldShellProps {
  fieldRef: string;
  kind: string;
  width?: string | undefined;
  visible?: boolean | undefined;
  children: ComponentChildren;
}

/** Layout wrapper that controls a field's grid span and visibility. */
export function FieldShell({
  fieldRef,
  kind,
  width,
  visible: visibleProp,
  children,
}: FieldShellProps): JSX.Element {
  const wide = width === FORM_FIELD_WIDTH.full || kind === FORM_FIELD_KIND.group;
  const visible = visibleProp ?? true;

  return (
    <div
      class={`${styles.field} ${wide ? styles.full : ""}`}
      data-ref={fieldRef}
      data-kind={kind}
      hidden={!visible}
      aria-hidden={!visible}
    >
      {children}
    </div>
  );
}

interface TextFieldProps {
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
export function TextField({
  fieldRef,
  label,
  required,
  name,
  placeholder,
  help,
  error,
  fallbackError,
  invalid,
  type,
  min,
  max,
  step,
  defaultValue,
  maxLength,
  modeHint,
  autocomplete,
}: TextFieldProps): JSX.Element {
  return (
    <FieldFrame
      fieldRef={fieldRef}
      label={label}
      required={required}
      help={help}
      error={error}
      fallbackError={fallbackError}
      invalid={invalid}
    >
      <qui-input
        name={name}
        required={required}
        {...stripNulishProps({
          placeholder,
          defaultValue,
          autocomplete,
          inputType: type,
          inputModeHint: modeHint,
          min,
          max,
          step,
          maxLength,
        })}
      />
    </FieldFrame>
  );
}
