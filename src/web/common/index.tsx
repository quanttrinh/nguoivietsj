/* @refresh reload */
import '~web/index.css';
import { render } from 'solid-js/web';
import 'solid-devtools';
import type { JSX } from 'solid-js';

function initializeApp(code: () => JSX.Element) {
  const root = document.getElementById('root');

  if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
    throw new Error(
      'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?'
    );
  }

  render(code, root!);
}

export { initializeApp };
