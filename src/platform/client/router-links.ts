// @boundary client
import { navigate } from "astro:transitions/client";

import { prefetch } from "astro:prefetch";

/** Matches the debounce Astro uses for its own hover strategy. */
const PREFETCH_HOVER_DELAY_MS = 80;

function findRouterLink(event: Event): HTMLElement | null {
  for (const node of event.composedPath()) {
    if (
      node instanceof HTMLElement &&
      !(node instanceof HTMLAnchorElement) &&
      !(node instanceof HTMLAreaElement) &&
      node.hasAttribute("href")
    ) {
      return node;
    }
  }

  return null;
}

function shouldLeaveNative(event: MouseEvent, link: HTMLElement) {
  if (
    event.button !== 0 ||
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey ||
    link.hasAttribute("download") ||
    link.dataset.astroReload !== undefined ||
    link.hasAttribute("disabled") ||
    link.getAttribute("aria-disabled") === "true"
  ) {
    return true;
  }

  const target = link.getAttribute("target");

  return target !== null && target !== "" && target !== "_self";
}

function resolveHref(link: HTMLElement): URL | null {
  const href = link.getAttribute("href");

  if (href === null || href.length === 0) {
    return null;
  }

  try {
    return new URL(href, globalThis.location.href);
  } catch {
    return null;
  }
}

function isSameLocation(url: URL) {
  return (
    url.pathname === globalThis.location.pathname &&
    url.search === globalThis.location.search &&
    url.hash === globalThis.location.hash
  );
}

function prefetchableUrl(event: Event): URL | null {
  const link = findRouterLink(event);

  if (
    link === null ||
    link.dataset.astroPrefetch === "false" ||
    link.hasAttribute("download") ||
    link.hasAttribute("disabled") ||
    link.getAttribute("aria-disabled") === "true"
  ) {
    return null;
  }

  const target = link.getAttribute("target");

  if (target !== null && target !== "" && target !== "_self") {
    return null;
  }

  return resolveHref(link);
}

function prefetchNow(event: Event) {
  const url = prefetchableUrl(event);

  if (url !== null) {
    prefetch(url.href, { ignoreSlowConnection: true });
  }
}

/**
 * Astro's prefetch only scans light-DOM anchors, so `qui-button href` links
 * (anchor inside a shadow root) were never prefetched. Mirror its hover, focus
 * and tap strategies here. `prefetch()` already skips cross-origin URLs, the
 * current page, duplicates, offline and Save-Data / 2G connections.
 */
function initRouterLinkPrefetch() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const schedule = (event: Event) => {
    const url = prefetchableUrl(event);

    if (url === null) {
      return;
    }

    cancel();
    timer = setTimeout(() => {
      prefetch(url.href);
    }, PREFETCH_HOVER_DELAY_MS);
  };
  const options = { capture: true, passive: true } as const;

  document.addEventListener(
    "pointerover",
    (event) => {
      if (event.pointerType !== "touch") {
        schedule(event);
      }
    },
    options,
  );
  document.addEventListener("pointerout", cancel, options);
  document.addEventListener("focusin", schedule, options);
  document.addEventListener("focusout", cancel, options);
  document.addEventListener("touchstart", prefetchNow, options);
  document.addEventListener("mousedown", prefetchNow, options);
}

/**
 * Astro's ClientRouter handles normal anchors. Bridge custom elements that
 * expose an `href` but keep their anchor inside a shadow root.
 */
export function initRouterLinks(): void {
  if (document.documentElement.dataset.routerLinksBound === "true") {
    return;
  }

  document.documentElement.dataset.routerLinksBound = "true";
  initRouterLinkPrefetch();

  document.addEventListener(
    "click",
    (event) => {
      if (!(event instanceof MouseEvent)) {
        return;
      }

      const link = findRouterLink(event);

      if (link === null || shouldLeaveNative(event, link)) {
        return;
      }

      const url = resolveHref(link);

      if (url === null || isSameLocation(url)) {
        return;
      }

      event.preventDefault();
      const go = async (): Promise<void> => {
        try {
          await navigate(url.href, { sourceElement: link });
        } catch {
          globalThis.location.assign(url.href);
        }
      };

      void go();
    },
    true,
  );
}
