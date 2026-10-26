/** Wire shared logout buttons. */
export function initLogoutButtons(): void {
  for (const button of document.querySelectorAll<HTMLQuiButtonElement>(
    '[data-logout-button]:not([data-ready="true"])',
  )) {
    button.dataset.ready = "true";
    button.addEventListener("click", () => {
      void (async (): Promise<void> => {
        const logoutUrl = button.dataset.logoutUrl;

        if (logoutUrl === undefined || logoutUrl.length === 0) {
          return;
        }

        button.disabled = true;

        try {
          const response = await fetch(logoutUrl, {
            method: "POST",
          });
          const data = (await response.json().catch(() => null)) as {
            redirect?: string;
          } | null;
          const destination =
            typeof data?.redirect === "string"
              ? data.redirect
              : (button.dataset.fallbackUrl ?? "/");

          globalThis.location.assign(destination);
        } catch (error) {
          console.error(error);
          button.disabled = false;
        }
      })();
    });
  }
}
