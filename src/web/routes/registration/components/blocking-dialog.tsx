import { Dialog } from '@ark-ui/solid/dialog';
import { Portal } from 'solid-js/web';
import type { JSX } from 'solid-js';

type BlockingDialogProps = Dialog.RootProps & {
  children: JSX.Element;
};

function BlockingDialog(props: BlockingDialogProps) {
  return (
    <Dialog.Root
      open={props.open}
      onOpenChange={props.onOpenChange}
    >
      <Portal>
        <Dialog.Backdrop class='fixed inset-0 z-50 bg-black/10 dark:bg-black/80 backdrop-blur-xs' />
        <Dialog.Positioner class='fixed inset-0 z-50 flex items-center justify-center p-4'>
          <Dialog.Content class='relative w-full max-w-sm bg-transparent p-5'>
            {props.children}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

export { BlockingDialog };
