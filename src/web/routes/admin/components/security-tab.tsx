import { For, Show } from 'solid-js';
import { Button } from '~/web/ui/button';
import { Card } from '~/web/ui/card';
import { Label } from '~/web/ui/label';
import { TextField, TextFieldInput } from '~/web/ui/text-field';

interface SecurityTabProps {
  protectedRoutes: string[];
  password: string;
  availableRoutes: string[];
  onToggleProtectedRoute: (route: string) => void;
  onPasswordChange: (password: string) => void;
}

export function SecurityTab(props: SecurityTabProps) {
  return (
    <Card class='p-6 space-y-6'>
      <div class='space-y-1'>
        <h2 class='text-sm font-medium'>Protected Routes</h2>
        <p class='text-sm text-muted-foreground'>Routes that require password authentication</p>
      </div>

      <Show when={props.protectedRoutes.length > 0}>
        <div class='space-y-2'>
          <For each={props.protectedRoutes}>
            {(route) => (
              <div class='flex items-center justify-between gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-sm'>
                <span class='text-blue-900 dark:text-blue-100'>{route}</span>
                <Button
                  onClick={() => props.onToggleProtectedRoute(route)}
                  variant='ghost'
                  size='sm'
                  class='text-blue-600 hover:text-blue-800 dark:text-blue-400'
                >
                  Remove
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
              <Show when={!props.protectedRoutes.includes(route)}>
                <div class='flex items-center justify-between gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded text-sm'>
                  <span>{route}</span>
                  <Button
                    onClick={() => props.onToggleProtectedRoute(route)}
                    variant='ghost'
                    size='sm'
                    class='text-green-600 hover:text-green-800 dark:text-green-400'
                  >
                    Add
                  </Button>
                </div>
              </Show>
            )}
          </For>
        </div>
      </div>

      <div class='space-y-2'>
        <Label for='password'>Site Password</Label>
        <TextField id='password'>
          <TextFieldInput
            type='password'
            value={props.password}
            onInput={(e: InputEvent) =>
              props.onPasswordChange((e.target as HTMLInputElement).value)
            }
            placeholder='Enter password'
          />
        </TextField>
        <p class='text-sm text-muted-foreground'>Password for accessing protected routes</p>
      </div>
    </Card>
  );
}
