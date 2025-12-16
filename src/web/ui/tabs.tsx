import { Tabs as ArkTabs } from '@ark-ui/solid/tabs';
import type { ComponentProps } from 'solid-js';
import { splitProps } from 'solid-js';

import { cn } from '~web/lib/utils';

const Tabs = ArkTabs.Root;

type TabsListProps = ComponentProps<typeof ArkTabs.List>;

const TabsList = (props: TabsListProps) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <ArkTabs.List
      class={cn(
        'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
        local.class
      )}
      {...others}
    />
  );
};

type TabsTriggerProps = ComponentProps<typeof ArkTabs.Trigger>;

const TabsTrigger = (props: TabsTriggerProps) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <ArkTabs.Trigger
      class={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[selected]:bg-background data-[selected]:text-foreground data-[selected]:shadow-sm',
        local.class
      )}
      {...others}
    />
  );
};

type TabsContentProps = ComponentProps<typeof ArkTabs.Content>;

const TabsContent = (props: TabsContentProps) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <ArkTabs.Content
      class={cn(
        'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        local.class
      )}
      {...others}
    />
  );
};

type TabsIndicatorProps = ComponentProps<typeof ArkTabs.Indicator>;

const TabsIndicator = (props: TabsIndicatorProps) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <ArkTabs.Indicator
      class={cn(
        'duration-250ms absolute transition-all data-[orientation=horizontal]:-bottom-px data-[orientation=vertical]:-right-px data-[orientation=horizontal]:h-[2px] data-[orientation=vertical]:w-[2px]',
        local.class
      )}
      {...others}
    />
  );
};

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsIndicator };
