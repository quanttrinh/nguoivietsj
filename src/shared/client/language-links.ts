/** Keep language links on the current query string after client navigation. */
function syncLanguageLinks(): void {
  const search = globalThis.location.search;

  if (search.length === 0) {
    return;
  }

  for (const link of document.querySelectorAll<HTMLAnchorElement>("a[data-language-link]")) {
    const url = new URL(link.href, globalThis.location.href);
    url.search = search;
    link.href = url.href;
  }
}

export function initLanguageLinks(): void {
  syncLanguageLinks();
  document.addEventListener("astro:page-load", syncLanguageLinks);
}
