import {
  createResource,
  onMount,
  onCleanup,
  Show,
  createEffect,
} from 'solid-js';
import { callScript } from '~/web/lib/googleapi';
import { Progress } from '@ark-ui/solid/progress';
import { getNonce } from '~/web/common/meta';

interface TicketStatusProps {
  visible: boolean;
  ticketStatusText?: string;
  noTicketsText?: string;
  onHeightChange?: (height: number) => void;
}

function TicketStatus(props: TicketStatusProps) {
  const [ticketStatus] = createResource(async () => {
    return await callScript('getTotalTicketStatus');
  });

  let containerRef: HTMLDivElement | undefined;

  // Update height whenever containerRef becomes available or content changes
  const updateHeight = () => {
    if (containerRef) {
      const height = containerRef.offsetHeight;
      props.onHeightChange?.(height);
    }
  };

  // Update height when ticket status loads
  createEffect(() => {
    if (ticketStatus()) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(updateHeight, 0);
    }
  });

  onMount(() => {
    // Initial height update
    updateHeight();

    // Update height on window resize
    const resizeObserver = new ResizeObserver(updateHeight);
    if (containerRef) {
      resizeObserver.observe(containerRef);
    }

    onCleanup(() => {
      resizeObserver.disconnect();
    });
  });

  const progressValue = () => {
    const currentTickets = Math.max(
      ticketStatus()?.currentTotalTickets || 0,
      0
    );
    const maxTickets = Math.max(ticketStatus()?.maxTotalTickets || 1, 0);
    return (currentTickets / maxTickets) * 100;
  };

  return (
    <Show when={ticketStatus()}>
      <div
        nonce={getNonce()}
        ref={(el) => (containerRef = el)}
        class='sticky top-0 px-6 pt-6 z-10 transition-all duration-300 bg-transparent overflow-visible'
        style={{
          opacity: props.visible ? '1' : '0',
        }}
      >
        <div class='relative w-full space-y-2'>
          <Progress.Root
            value={progressValue()}
            class='w-full'
          >
            <Progress.Track class='h-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden'>
              <Progress.Range
                nonce={getNonce()}
                class='h-full transition-all duration-300 ease-out rounded-full bg-left bg-linear-to-r from-green-500 to-red-500'
                style={{
                  'background-size': `${100 / (progressValue() / 100)}% 100%`,
                }}
              />
            </Progress.Track>
          </Progress.Root>
          <div class='flex justify-center'>
            <span class='text-xs whitespace-nowrap'>
              <Show
                when={
                  props.noTicketsText &&
                  ticketStatus()?.currentTotalTickets ===
                    ticketStatus()?.maxTotalTickets
                }
                fallback={
                  <>
                    {ticketStatus()?.currentTotalTickets ?? 0}
                    {' / '}
                    {ticketStatus()?.maxTotalTickets ?? 0}
                  </>
                }
              >
                {props.noTicketsText}
              </Show>
            </span>
          </div>
        </div>
      </div>
    </Show>
  );
}

export { TicketStatus };
