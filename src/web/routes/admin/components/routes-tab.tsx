import { For, Show } from 'solid-js';
import { Button } from '~/web/ui/button';
import { Card } from '~/web/ui/card';

interface RoutesTabProps {
  closedRoutes: string[];
  availableRoutes: string[];
  onToggleClosedRoute: (route: string) => void;
}

export function RoutesTab(props: RoutesTabProps) {
  return (
    <Card class='p-6 space-y-6'>
      <div class='space-y-1'>
        <h2 class='text-sm font-medium'>Closed Routes</h2>
        <p class='text-sm text-muted-foreground'>
          Manage routes that are temporarily closed or disabled.
        </p>
      </div>

      <Show when={props.closedRoutes.length > 0}>
        <div class='space-y-2'>
          <For each={props.closedRoutes}>
            {(route) => (
              <div class='flex items-center justify-between gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm'>
                <span class='text-red-900 dark:text-red-100'>{route}</span>
                <Button
                  onClick={() => props.onToggleClosedRoute(route)}
                  variant='ghost'
                  size='sm'
                  class='text-red-600 hover:text-red-800 dark:text-red-400'
                >
                  Open
                </Button>
              </div>
            )}
          </For>
        </div>
      </Show>

      <div class='space-y-2'>
        <h3 class='text-sm font-medium'>Available Routes</h3>
        <div class='space-y-2'>
          <For each={props.availableRoutes}>
            {(route) => (
              <Show when={!props.closedRoutes.includes(route)}>
                <div class='flex items-center justify-between gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded text-sm'>
                  <span>{route}</span>
                  <Button
                    onClick={() => props.onToggleClosedRoute(route)}
                    variant='ghost'
                    size='sm'
                    class='text-orange-600 hover:text-orange-800 dark:text-orange-400'
                  >
                    Close
                  </Button>
                </div>
              </Show>
            )}
          </For>
        </div>
      </div>
    </Card>
  );
}
