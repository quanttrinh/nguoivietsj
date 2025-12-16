import Languages from 'lucide-solid/icons/languages';
import { For } from 'solid-js';
import { Button } from '~/web/ui/button';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '~/web/ui/menu';

type LocaleSwitcherProps<Locales extends string> = {
  locales: { code: Locales; label: string }[];
  onLocaleChange?: (locale: Locales) => void;
};

function LocaleSwitcher<Locales extends string>({
  locales,
  onLocaleChange,
}: LocaleSwitcherProps<Locales>) {
  return (
    <Menu onSelect={(details) => onLocaleChange?.(details.value as Locales)}>
      <MenuTrigger>
        <Button
          variant='ghost'
          size='sm'
          class='w-9 px-0'
        >
          <Languages class='size-6' />
          <span class='sr-only'>Toggle language</span>
        </Button>
      </MenuTrigger>
      <MenuContent>
        <For each={locales}>
          {(locale) => (
            <MenuItem value={locale.code}>
              <span>{locale.label}</span>
            </MenuItem>
          )}
        </For>
      </MenuContent>
    </Menu>
  );
}

export { LocaleSwitcher };
