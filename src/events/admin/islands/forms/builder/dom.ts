/* oxlint-disable eslint/max-params -- Builder controls take value, options, change handler, and optional label. */

import { builderStyles } from "./styles";

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  if (text !== undefined) {
    node.textContent = text;
  }

  return node;
}

export function button(label: string, onClick: () => void): HTMLQuiButtonElement {
  const node = document.createElement("qui-button");
  node.variant = "outlined";
  node.size = "sm";
  node.textContent = label;
  node.addEventListener("click", onClick);
  return node;
}

export interface SelectOption {
  value: string;
  label: string;
}

function applyLabel(node: HTMLElement, ariaLabel?: string): void {
  if (ariaLabel !== undefined) {
    node.setAttribute("aria-label", ariaLabel);
  }
}

export function textInput(
  value: string,
  onChange: (value: string) => void,
  ariaLabel?: string,
): HTMLQuiInputElement {
  const node = document.createElement("qui-input");
  node.className = builderStyles.fieldInput;
  node.defaultValue = value;
  applyLabel(node, ariaLabel);
  node.addEventListener("valuechange", (event) => {
    onChange(event.detail.value);
  });
  return node;
}

export function numberInput(
  value: number | undefined,
  onChange: (value: string) => void,
  ariaLabel?: string,
  step?: number,
  minimum?: number,
): HTMLQuiInputElement {
  const node = document.createElement("qui-input");
  node.className = builderStyles.fieldInput;
  node.inputType = "number";
  node.inputModeHint = "numeric";
  node.defaultValue = value === undefined ? "" : String(value);

  if (step !== undefined) {
    node.step = step;
  }

  if (minimum !== undefined) {
    node.min = minimum;
  }

  applyLabel(node, ariaLabel);
  node.addEventListener("valuechange", (event) => {
    onChange(event.detail.value);
  });
  return node;
}

export function textareaInput(
  value: string,
  onChange: (value: string) => void,
): HTMLQuiTextareaElement {
  const node = document.createElement("qui-textarea");
  node.className = builderStyles.textarea;
  node.defaultValue = value;
  node.addEventListener("valuechange", (event) => {
    onChange(event.detail.value);
  });
  return node;
}

export function selectInput(
  value: string,
  options: readonly SelectOption[],
  onChange: (value: string) => void,
  ariaLabel?: string,
): HTMLQuiSelectElement {
  const node = document.createElement("qui-select");
  node.className = builderStyles.select;
  applyLabel(node, ariaLabel);

  for (const optionValue of options) {
    const option = document.createElement("qui-option");
    option.value = optionValue.value;
    option.textContent = optionValue.label;
    node.append(option);
  }

  node.defaultValue = [value];
  node.addEventListener("valuechange", (event) => {
    onChange(event.detail.value[0] ?? "");
  });
  return node;
}

export function checkboxInput(
  checked: boolean,
  label: string,
  onChange: (checked: boolean) => void,
): HTMLQuiCheckboxElement {
  const node = document.createElement("qui-checkbox");
  node.defaultChecked = checked;
  node.textContent = label;
  node.addEventListener("checkedchange", (event) => {
    onChange(event.detail.checked === true);
  });
  return node;
}
