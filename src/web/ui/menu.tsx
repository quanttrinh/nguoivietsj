import { Menu as ArkMenu } from '@ark-ui/solid/menu';
import type { Component, ComponentProps } from 'solid-js';
import { splitProps } from 'solid-js';

import { cn } from '~web/lib/utils';

const Menu = ArkMenu.Root;

const MenuTrigger = ArkMenu.Trigger;
const MenuGroup = ArkMenu.ItemGroup;
const MenuPortal = ArkMenu.Positioner;

type MenuContentProps = ComponentProps<typeof ArkMenu.Content>;

const MenuContent = (props: MenuContentProps) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <ArkMenu.Positioner>
      <ArkMenu.Content
        class={cn(
          'z-50 min-w-32 origin-(--transform-origin) animate-content-hide overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-content-show',
          local.class
        )}
        {...others}
      />
    </ArkMenu.Positioner>
  );
};

type MenuItemProps = ComponentProps<typeof ArkMenu.Item>;

const MenuItem = (props: MenuItemProps) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <ArkMenu.Item
      class={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        local.class
      )}
      {...others}
    />
  );
};

const MenuShortcut: Component<ComponentProps<'span'>> = (props) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <span
      class={cn('ml-auto text-xs tracking-widest opacity-60', local.class)}
      {...others}
    />
  );
};

const MenuLabel: Component<
  ComponentProps<typeof ArkMenu.ItemGroupLabel> & { inset?: boolean }
> = (props) => {
  const [local, others] = splitProps(props, ['class', 'inset']);
  return (
    <ArkMenu.ItemGroupLabel
      class={cn(
        'px-2 py-1.5 text-sm font-semibold',
        local.inset && 'pl-8',
        local.class
      )}
      {...others}
    />
  );
};

type MenuSeparatorProps = ComponentProps<typeof ArkMenu.Separator>;

const MenuSeparator = (props: MenuSeparatorProps) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <ArkMenu.Separator
      class={cn('-mx-1 my-1 h-px bg-muted', local.class)}
      {...others}
    />
  );
};

export {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuShortcut,
  MenuPortal,
};
