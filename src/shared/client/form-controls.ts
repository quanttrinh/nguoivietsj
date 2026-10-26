/** Helpers for native controls and form-associated qui custom elements. */

type ValueControl = HTMLElement & {
  value?: unknown;
  checked?: unknown;
  focusControl?: (options?: FocusOptions) => Promise<void>;
};

function nativeControl(
  root: Element | null,
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  return root?.shadowRoot?.querySelector("input, textarea, select") ?? null;
}

/** Read the current value from a native control or a qui form control. */
export function readControlValue(element: Element | null): string {
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

  if (element instanceof HTMLElement) {
    const native = nativeControl(element);

    if (native !== null) {
      return native.value;
    }

    const value = (element as ValueControl).value;

    if (Array.isArray(value)) {
      return String(value[0] ?? "");
    }

    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
  }

  return "";
}

/** Read the checked state from a native checkbox or a qui checkbox. */
export function readControlChecked(element: Element | null): boolean {
  if (element instanceof HTMLInputElement) {
    return element.checked;
  }

  if (element instanceof HTMLElement) {
    const checked = (element as ValueControl).checked;

    if (typeof checked === "boolean") {
      return checked;
    }

    const native = nativeControl(element);

    return native instanceof HTMLInputElement ? native.checked : false;
  }

  return false;
}

function namedControl(form: HTMLFormElement, name: string): HTMLElement | null {
  for (const element of form.elements) {
    if (
      element instanceof HTMLElement &&
      (element as HTMLElement & { name?: string }).name === name
    ) {
      return element;
    }
  }

  return null;
}

/** Read a named field from a form, including form-associated custom elements. */
export function readFormValue(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);

  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  return readControlValue(namedControl(form, name));
}

/** Read a named checkbox from a form, including form-associated custom elements. */
export function readFormChecked(form: HTMLFormElement, name: string): boolean {
  const element = namedControl(form, name);

  if (element !== null) {
    return readControlChecked(element);
  }

  return new FormData(form).has(name);
}

/** Focus the inner control of a native or qui form control. */
export function focusControl(element: HTMLElement | null): void {
  if (element === null) {
    return;
  }

  const control = element as ValueControl;

  if (control.focusControl !== undefined) {
    void control.focusControl();
    return;
  }

  element.focus();
}
