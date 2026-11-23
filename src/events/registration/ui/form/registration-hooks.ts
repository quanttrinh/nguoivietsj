// @boundary client
import type { RefObject } from "preact";
import { useEffect } from "preact/hooks";

/** Mount the Turnstile widget inside a rendered container. */
export function useTurnstileWidget(ref: RefObject<HTMLDivElement | null>): void {
  useEffect((): (() => void) | undefined => {
    const container = ref.current;

    if (container === null) {
      return undefined;
    }

    let cancelled = false;

    const mount = async (): Promise<void> => {
      const { mountTurnstileWidgets } = await import("~/shared/client/turnstile");

      if (!cancelled) {
        await mountTurnstileWidgets(container);
      }
    };

    void mount();

    return (): void => {
      cancelled = true;
    };
  }, [ref]);
}
