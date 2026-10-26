import { TURNSTILE_SCRIPT_URL } from "astro:env/client";

interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove?: (widgetId?: string) => void;
}

interface QueryRoot {
  querySelectorAll: <E extends Element = Element>(selectors: string) => NodeListOf<E>;
}

type TurnstileGlobal = typeof globalThis & { turnstile?: TurnstileApi };

let loader: Promise<TurnstileApi> | null = null;
const mounting = new WeakSet<HTMLElement>();

function turnstileApi(): TurnstileApi | undefined {
  return (globalThis as TurnstileGlobal).turnstile;
}

function loadTurnstile(): Promise<TurnstileApi> {
  const existing = turnstileApi();

  if (existing !== undefined) {
    return Promise.resolve(existing);
  }

  loader ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      const api = turnstileApi();

      if (api === undefined) {
        loader = null;
        reject(new Error("Turnstile loaded without exposing its API."));
        return;
      }

      resolve(api);
    });
    script.addEventListener("error", () => {
      loader = null;
      reject(new Error("Failed to load Turnstile."));
    });
    document.head.append(script);
  });

  return loader;
}

function widgetIdFor(container: HTMLElement): string | null {
  const widgetId = container.dataset.widgetId;

  return widgetId === undefined || widgetId.length === 0 ? null : widgetId;
}

function clearToken(container: HTMLElement): void {
  delete container.dataset.tokenReady;
}

function hasWidget(container: HTMLElement): boolean {
  return container.querySelector("iframe") !== null;
}

function clearWidgetState(container: HTMLElement): void {
  clearToken(container);
  delete container.dataset.widgetId;
  delete container.dataset.ready;
}

/** Remove a rendered widget and clear the state kept on its container. */
function removeWidget(container: HTMLElement): void {
  const widgetId = widgetIdFor(container);

  if (widgetId !== null && hasWidget(container)) {
    try {
      turnstileApi()?.remove?.(widgetId);
    } catch {
      // Turnstile may already have dropped the widget.
    }
  }

  clearWidgetState(container);
}

/** Drop widgets that were unmounted without calling `turnstile.remove()`. */
function removeTurnstileWidgets(root: QueryRoot): void {
  for (const container of root.querySelectorAll<HTMLElement>("[data-turnstile]")) {
    removeWidget(container);
  }
}

/** Re-render containers whose widget disappeared during a DOM swap. */
function resetStaleWidgets(root: QueryRoot): void {
  for (const container of root.querySelectorAll<HTMLElement>("[data-turnstile]")) {
    if (container.dataset.ready === "true" && !hasWidget(container)) {
      clearWidgetState(container);
    }
  }
}

/** Render Turnstile widgets that are present in the current document. */
export async function mountTurnstileWidgets(root: QueryRoot = document): Promise<void> {
  resetStaleWidgets(root);

  const containers = [
    ...root.querySelectorAll<HTMLElement>("[data-turnstile]:not([data-ready='true'])"),
  ].filter((container) => !mounting.has(container));

  if (containers.length === 0) {
    return;
  }

  for (const container of containers) {
    mounting.add(container);
  }

  try {
    const api = await loadTurnstile().catch((error: unknown) => {
      console.error(error);
      return null;
    });

    if (api === null) {
      return;
    }

    for (const container of containers) {
      const sitekey = container.dataset.sitekey;
      const action = container.dataset.action;

      if (sitekey !== undefined && action !== undefined) {
        removeWidget(container);

        try {
          const widgetId = api.render(container, {
            sitekey,
            action,
            theme: "auto",
            size: "flexible",
            "response-field": true,
            "response-field-name": "turnstileToken",
            callback: () => {
              container.dataset.tokenReady = "true";
            },
            "expired-callback": () => {
              clearToken(container);
            },
            "error-callback": () => {
              clearToken(container);
            },
          });

          container.dataset.widgetId = widgetId;
          container.dataset.ready = "true";
        } catch (error) {
          console.error("Failed to render Turnstile", error);
          clearWidgetState(container);
        }
      }
    }
  } finally {
    for (const container of containers) {
      mounting.delete(container);
    }
  }
}

/** Reset every widget inside a form after a failed server request. */
export function resetTurnstile(root: QueryRoot): void {
  for (const container of root.querySelectorAll<HTMLElement>("[data-turnstile]")) {
    clearToken(container);

    const widgetId = widgetIdFor(container);

    if (widgetId !== null && hasWidget(container)) {
      try {
        turnstileApi()?.reset(widgetId);
      } catch {
        // Re-render a widget Turnstile no longer knows.
        clearWidgetState(container);
      }
    } else {
      clearWidgetState(container);
    }
  }

  void mountTurnstileWidgets(root);
}

void mountTurnstileWidgets();
document.addEventListener("astro:page-load", () => {
  void mountTurnstileWidgets();
});
document.addEventListener("astro:before-swap", () => {
  removeTurnstileWidgets(document);
});
