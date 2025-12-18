import { For, Show } from 'solid-js';
import { Button } from '~/web/ui/button';
import { Card } from '~/web/ui/card';
import { TextField, TextFieldInput } from '~/web/ui/text-field';
import { NumberField, NumberFieldInput } from '~/web/ui/number-field';
import {
  Switch,
  SwitchControl,
  SwitchThumb,
  SwitchLabel,
} from '~/web/ui/switch';

interface MetaField {
  type: 'string' | 'number' | 'boolean';
  defaultValue: string;
}

interface MetadataTabProps {
  availableRoutes: Array<{
    path: string;
    metaFields: Record<string, MetaField>;
  }>;
  routeMetadata: Record<string, Record<string, string>>;
  onUpdateRouteMetadata: (route: string, key: string, value: string) => void;
  onRemoveRouteMetadata: (route: string, key: string) => void;
}

export function MetadataTab(props: MetadataTabProps) {
  return (
    <Card class='p-6 space-y-6'>
      <div class='space-y-1'>
        <h2 class='text-sm font-medium'>Route Metadata</h2>
        <p class='text-sm text-muted-foreground'>
          Edit custom meta tag values for each route. Default values are shown as
          placeholders.
        </p>
      </div>

      <div class='space-y-4'>
        <For each={props.availableRoutes}>
          {(route) => (
            <Show when={Object.keys(route.metaFields).length > 0}>
              <div class='p-4 border border-border rounded-lg space-y-3'>
                <h3 class='text-sm font-medium'>{route.path}</h3>

                <div class='space-y-3'>
                  <For each={Object.entries(route.metaFields)}>
                    {([key, field]) => (
                      <div class='flex gap-2 items-end'>
                        <div class='flex-1 space-y-1.5'>
                          <div class='flex items-center justify-between gap-2'>
                            <span class='text-xs font-medium text-muted-foreground'>{key}</span>
                            <span class='text-xs text-muted-foreground'>{field.type}</span>
                          </div>

                        <Show when={field.type === 'boolean'}>
                          <Switch
                            checked={
                              props.routeMetadata[route.path]?.[key]
                                ? props.routeMetadata[route.path][key] ===
                                  'true'
                                : field.defaultValue === 'true'
                            }
                            onCheckedChange={(details) =>
                              props.onUpdateRouteMetadata(
                                route.path,
                                key,
                                String(details.checked)
                              )
                            }
                          >
                            <SwitchControl>
                              <SwitchThumb />
                            </SwitchControl>
                            <SwitchLabel class='text-xs'>
                              {props.routeMetadata[route.path]?.[key]
                                ? props.routeMetadata[route.path][key] ===
                                  'true'
                                  ? 'Enabled'
                                  : 'Disabled'
                                : field.defaultValue === 'true'
                                  ? 'Enabled (default)'
                                  : 'Disabled (default)'}
                            </SwitchLabel>
                          </Switch>
                        </Show>

                        <Show when={field.type === 'number'}>
                          <NumberField
                            value={props.routeMetadata[route.path]?.[key] || ''}
                            onValueChange={(details) =>
                              props.onUpdateRouteMetadata(
                                route.path,
                                key,
                                details.value
                              )
                            }
                            class='w-full'
                          >
                            <NumberFieldInput
                              placeholder={field.defaultValue}
                            />
                          </NumberField>
                        </Show>

                        <Show when={field.type === 'string'}>
                          <TextField class='w-full'>
                            <TextFieldInput
                              type='text'
                              value={
                                props.routeMetadata[route.path]?.[key] || ''
                              }
                              placeholder={field.defaultValue}
                              onInput={(e: InputEvent) =>
                                props.onUpdateRouteMetadata(
                                  route.path,
                                  key,
                                  (e.target as HTMLInputElement).value
                                )
                              }
                            />
                          </TextField>
                        </Show>
                      </div>
                      <Show when={props.routeMetadata[route.path]?.[key]}>
                        <Button
                          onClick={() =>
                            props.onRemoveRouteMetadata(route.path, key)
                          }
                          variant='outline'
                          size='sm'
                          title='Reset to default'
                        >
                          Reset
                        </Button>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        )}
      </For>
      </div>
    </Card>
  );
}
