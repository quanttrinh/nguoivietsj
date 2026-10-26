interface BeforeSwapEvent extends Event {
  from: URL;
  newDocument: Document;
  sourceElement?: Element | null;
  to: URL;
}

/** Keep the event title visible while navigating between subpages of the same event. */
export function initTitlePreserve(): void {
  if (document.documentElement.dataset.titlePreserveBound === "true") {
    return;
  }

  document.documentElement.dataset.titlePreserveBound = "true";

  document.addEventListener("astro:before-swap", (event) => {
    const swap = event as BeforeSwapEvent;
    const newTitle = swap.newDocument.querySelector<HTMLElement>("[data-title-preserve]");

    if (newTitle === null) {
      return;
    }

    const sourceTitle = swap.sourceElement
      ?.querySelector<HTMLElement>("[data-title-source]")
      ?.textContent?.trim();

    if (sourceTitle !== undefined && sourceTitle.length > 0) {
      newTitle.textContent = sourceTitle;
      return;
    }

    const oldEventId = swap.from.searchParams.get("event");
    const newEventId = swap.to.searchParams.get("event");

    if (oldEventId === null || oldEventId !== newEventId) {
      return;
    }

    const oldTitle = document.querySelector<HTMLElement>("[data-title-preserve]");
    const text = oldTitle?.textContent?.trim() ?? "";

    if (text.length > 0) {
      newTitle.textContent = text;
    }
  });
}
