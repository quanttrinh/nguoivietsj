/** Read a JSON script tag by element id. */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- the generic describes the expected payload shape.
export function readJsonScript<T>(id: string): T | null {
  const script = document.querySelector<HTMLScriptElement>(`#${id}`);

  if (script?.textContent === null || script?.textContent === undefined) {
    return null;
  }

  return JSON.parse(script.textContent) as T;
}

/**
 * Serialize JSON for `<script type="application/json">`.
 *
 * Escaping `<` prevents a `</script>` sequence inside user content from
 * terminating the element early. The value is still valid JSON.
 */
export function stringifyJsonScript(value: unknown): string {
  return (JSON.stringify(value) ?? "null")
    .replaceAll("<", String.raw`\u003C`)
    .replaceAll("\u2028", String.raw`\u2028`)
    .replaceAll("\u2029", String.raw`\u2029`);
}
