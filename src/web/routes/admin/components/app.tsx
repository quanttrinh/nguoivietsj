import { createSignal, createResource, createEffect, Show } from 'solid-js';
import { callScript } from '~/web/lib/googleapi';
import { Button } from '~/web/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '~/web/ui/tabs';

import { SecurityTab } from './security-tab';
import { RoutesTab } from './routes-tab';
import { MetadataTab } from './metadata-tab';

import type { AdminConfig, AvailableRoutes } from '~/server/admin-panel';

export function AdminPage() {
  const [config] = createResource<AdminConfig>(async () => {
    return await callScript('getAdminConfig');
  });

  const [availableRoutes] = createResource<AvailableRoutes>(async () => {
    return await callScript('getAvailableRoutes');
  });

  const [protectedRoutes, setProtectedRoutes] = createSignal<string[]>([]);
  const [password, setPassword] = createSignal('');
  const [closedRoutes, setClosedRoutes] = createSignal<string[]>([]);
  const [routeMetadata, setRouteMetadata] = createSignal<
    Record<string, Record<string, string>>
  >({});
  const [saving, setSaving] = createSignal(false);
  const [saveMessage, setSaveMessage] = createSignal('');

  // Initialize signals when config loads
  createEffect(() => {
    const cfg = config();
    if (cfg) {
      setProtectedRoutes(cfg.protectedRoutes ? cfg.protectedRoutes : []);
      setPassword(cfg.password);
      setClosedRoutes(cfg.closedRoutes ? cfg.closedRoutes : []);
      setRouteMetadata(cfg.routeMetadata);
    }
  });

  const saveConfig = async () => {
    setSaving(true);
    setSaveMessage('');

    try {
      await callScript('setAdminConfig', null, {
        protectedRoutes: protectedRoutes(),
        password: password(),
        closedRoutes: closedRoutes(),
        routeMetadata: routeMetadata(),
      });

      setSaveMessage('Configuration saved successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      setSaveMessage('Error saving configuration: ' + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleProtectedRoute = (route: string) => {
    setProtectedRoutes((prev) =>
      prev.includes(route) ? prev.filter((r) => r !== route) : [...prev, route]
    );
  };

  const toggleClosedRoute = (route: string) => {
    setClosedRoutes((prev) =>
      prev.includes(route) ? prev.filter((r) => r !== route) : [...prev, route]
    );
  };

  const updateRouteMetadata = (route: string, key: string, value: string) => {
    setRouteMetadata((prev) => ({
      ...prev,
      [route]: {
        ...(prev[route] || {}),
        [key]: value,
      },
    }));
  };

  const removeRouteMetadata = (route: string, key: string) => {
    setRouteMetadata((prev) => {
      const updated = { ...prev };
      if (updated[route]) {
        const routeMeta = { ...updated[route] };
        delete routeMeta[key];
        if (Object.keys(routeMeta).length === 0) {
          delete updated[route];
        } else {
          updated[route] = routeMeta;
        }
      }
      return updated;
    });
  };

  return (
    <div class='min-h-screen bg-transparent p-6'>
      <div class='max-w-4xl mx-auto'>
        <Show
          when={config()}
          fallback={<div class='text-center py-10'>Loading...</div>}
        >
          <Tabs defaultValue='security'>
            <TabsList class='mb-6'>
              <TabsTrigger value='security'>Security</TabsTrigger>
              <TabsTrigger value='routes'>Routes</TabsTrigger>
              <TabsTrigger value='metadata'>Metadata</TabsTrigger>
            </TabsList>

            <TabsContent value='security'>
              <SecurityTab
                protectedRoutes={protectedRoutes()}
                password={password()}
                availableRoutes={
                  availableRoutes()?.routes.map((r) => r.path) || []
                }
                onToggleProtectedRoute={toggleProtectedRoute}
                onPasswordChange={setPassword}
              />
            </TabsContent>

            <TabsContent value='routes'>
              <RoutesTab
                closedRoutes={closedRoutes()}
                availableRoutes={
                  availableRoutes()?.routes.map((r) => r.path) || []
                }
                onToggleClosedRoute={toggleClosedRoute}
              />
            </TabsContent>

            <TabsContent value='metadata'>
              <MetadataTab
                availableRoutes={availableRoutes()?.routes || []}
                routeMetadata={routeMetadata()}
                onUpdateRouteMetadata={updateRouteMetadata}
                onRemoveRouteMetadata={removeRouteMetadata}
              />
            </TabsContent>
          </Tabs>

          <div class='mt-6 flex items-center justify-between'>
            <Show when={saveMessage()}>
              <p
                classList={{
                  'text-sm': true,
                  'text-red-600 dark:text-red-400':
                    saveMessage().includes('Error'),
                  'text-green-600 dark:text-green-400':
                    !saveMessage().includes('Error'),
                }}
              >
                {saveMessage()}
              </p>
            </Show>
            <Button
              onClick={saveConfig}
              disabled={saving()}
              class='ml-auto'
            >
              <Show
                when={saving()}
                fallback='Save Configuration'
              >
                Saving...
              </Show>
            </Button>
          </div>
        </Show>
      </div>
    </div>
  );
}
