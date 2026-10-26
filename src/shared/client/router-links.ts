// @boundary client
import { navigate } from "astro:transitions/client";

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

function shouldLeaveNative(event: MouseEvent, link: HTMLElement): boolean {
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

function isSameLocation(url: URL): boolean {
  return (
    url.pathname === globalThis.location.pathname &&
    url.search === globalThis.location.search &&
    url.hash === globalThis.location.hash
  );
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
