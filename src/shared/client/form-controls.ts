// @boundary client
/** Helpers for native controls and form-associated qui custom elements. */

type ValueControl = HTMLElement & { getValue?: () => Promise<unknown> };
type FocusableControl = HTMLElement & { focusControl?: (options?: FocusOptions) => Promise<void> };

/** Read the current value from a native control or a qui form control. */
export async function readControlValue(element: Element | null): Promise<string> {
  if (element === null) {
    return "";
  }

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element.value;
  }

  if (!(element instanceof HTMLElement)) {
    return "";
  }

  const getValue = (element as ValueControl).getValue;

  if (typeof getValue !== "function") {
    return "";
  }

  const value = await getValue.call(element);

  if (Array.isArray(value)) {
    return String(value[0] ?? "");
  }

  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/** Read a named field from a form, including form-associated qui custom elements. */
export function readFormValue(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);

  return typeof value === "string" ? value : "";
}

/** Read a named checkbox from a form, including form-associated qui custom elements. */
export function readFormChecked(form: HTMLFormElement, name: string): boolean {
  return new FormData(form).has(name);
}

/** Focus the inner control of a native or qui form control. */
export function focusControl(element: HTMLElement | null): void {
  if (element === null) {
    return;
  }

  const control = element as FocusableControl;

  if (control.focusControl !== undefined) {
    void control.focusControl();
    return;
  }

  element.focus();
}
