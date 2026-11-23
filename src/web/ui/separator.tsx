import type { Component, ComponentProps } from 'solid-js';
import { splitProps } from 'solid-js';

import { cn } from '~web/lib/utils';

type SeparatorProps = ComponentProps<'div'> & {
  orientation?: 'horizontal' | 'vertical';
};

const Separator: Component<SeparatorProps> = (props) => {
  const [local, others] = splitProps(props, ['class', 'orientation']);
  const orientation = local.orientation ?? 'horizontal';

  return (
    <div
      role='separator'
      aria-orientation={orientation}
      class={cn(
        'shrink-0 bg-border',
        orientation === 'vertical' ? 'h-full w-px' : 'h-px w-full',
        local.class
      )}
      {...others}
    />
  );
};

export { Separator };
export type { SeparatorProps };
