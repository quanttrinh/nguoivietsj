import { Dialog as Dg } from '@ark-ui/solid/dialog';
import { Portal } from 'solid-js/web';
import type { JSX } from 'solid-js';

type DialogProps = Dg.RootProps & {
  children: JSX.Element;
};

function Dialog(props: DialogProps) {
  return (
    <Dg.Root
      open={props.open}
      onOpenChange={props.onOpenChange}
    >
      <Portal>
        <Dg.Backdrop class='fixed inset-0 z-50 bg-black/10 dark:bg-black/80 backdrop-blur-xs' />
        <Dg.Positioner class='fixed inset-0 z-50 flex items-center justify-center p-4'>
          <Dg.Content class='relative p-5 shadow-lg bg-background rounded-md'>
            {props.children}
          </Dg.Content>
        </Dg.Positioner>
      </Portal>
    </Dg.Root>
  );
}

export { Dialog };
