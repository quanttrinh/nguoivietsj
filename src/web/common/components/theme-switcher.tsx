import { createEffect, createSignal, onCleanup } from 'solid-js';
import { makePersisted } from '@solid-primitives/storage';

import Sun from 'lucide-solid/icons/sun';
import Moon from 'lucide-solid/icons/moon';
import Laptop from 'lucide-solid/icons/laptop';

import { Button } from '~/web/ui/button';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '~/web/ui/menu';

function ThemeSwitcher() {
  const [colorMode, setColorMode] = makePersisted(
    createSignal<'light' | 'dark' | 'system'>('system'),
    { storage: localStorage, name: 'color-theme' }
  );

  createEffect(() => {
    const mode = colorMode();
    const root = document.documentElement;

    const apply = (mode: 'light' | 'dark') => {
      root.dataset.theme = mode; // for any rules expecting data-theme
      root.classList.toggle('dark', mode === 'dark'); // Tailwind dark class
    };

    if (mode === 'system') {
      const mediaQueries = window.matchMedia('(prefers-color-scheme: dark)');
      apply(mediaQueries.matches ? 'dark' : 'light');
      const handler = (e: MediaQueryListEvent) =>
        apply(e.matches ? 'dark' : 'light');
      // add listener and cleanup
      mediaQueries.addEventListener('change', handler);
      onCleanup(() => mediaQueries.removeEventListener('change', handler));
    } else {
      apply(mode);
    }
  });

  return (
    <Menu
      onSelect={(details) =>
        setColorMode(details.value as 'light' | 'dark' | 'system')
      }
    >
      <MenuTrigger>
        <Button
          variant='ghost'
          size='sm'
          class='w-9 px-0'
        >
          <Sun class='size-6 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0' />
          <Moon class='absolute size-6 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100' />
          <span class='sr-only'>Toggle theme</span>
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem value='light'>
          <Sun class='mr-2 size-4' />
          <span>Light</span>
        </MenuItem>
        <MenuItem value='dark'>
          <Moon class='mr-2 size-4' />
          <span>Dark</span>
        </MenuItem>
        <MenuItem value='system'>
          <Laptop class='mr-2 size-4' />
          <span>System</span>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export { ThemeSwitcher };
