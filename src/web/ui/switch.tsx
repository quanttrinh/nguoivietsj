import { Switch as ArkSwitch } from '@ark-ui/solid/switch';
import type { ComponentProps } from 'solid-js';
import { splitProps } from 'solid-js';

import { cn } from '~web/lib/utils';

const Switch = ArkSwitch.Root;
const SwitchContext = ArkSwitch.Context;
const SwitchHiddenInput = ArkSwitch.HiddenInput;

type SwitchControlProps = ComponentProps<typeof ArkSwitch.Control>;

const SwitchControl = (props: SwitchControlProps) => {
  const [local, others] = splitProps(props, ['class', 'children']);
  return (
    <ArkSwitch.Control
      class={cn(
        'inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-input transition-[color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[disabled]:cursor-not-allowed data-[checked]:bg-primary data-[disabled]:opacity-50',
        local.class
      )}
      {...others}
    >
      {local.children}
    </ArkSwitch.Control>
  );
};

type SwitchThumbProps = ComponentProps<typeof ArkSwitch.Thumb>;

const SwitchThumb = (props: SwitchThumbProps) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <ArkSwitch.Thumb
      class={cn(
        'pointer-events-none block size-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[checked]:translate-x-5',
        local.class
      )}
      {...others}
    />
  );
};

type SwitchLabelProps = ComponentProps<typeof ArkSwitch.Label>;

const SwitchLabel = (props: SwitchLabelProps) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <ArkSwitch.Label
      class={cn(
        'text-sm font-medium leading-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-70',
        local.class
      )}
      {...others}
    />
  );
};

export {
  Switch,
  SwitchContext,
  SwitchControl,
  SwitchThumb,
  SwitchLabel,
  SwitchHiddenInput,
};
