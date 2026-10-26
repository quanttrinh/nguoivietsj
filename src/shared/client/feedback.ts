export type NoticeTone = "success" | "error";

/** Show a status or error message in a notice element. */
export function showNotice(
  notice: HTMLElement | null,
  message: string,
  tone: NoticeTone = "error",
): void {
  if (notice === null) {
    return;
  }

  notice.dataset.tone = tone;
  notice.textContent = message;
  notice.hidden = false;
  notice.focus();
}

/** Hide and clear a notice element. */
export function clearNotice(notice: HTMLElement | null): void {
  if (notice === null) {
    return;
  }

  notice.hidden = true;
  notice.replaceChildren();
}
