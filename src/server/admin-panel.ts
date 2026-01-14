import { INTERNAL_METADATA } from './constants';
import { getRouteHTML, getManifest, getRouteManifest } from './webapp';

interface AdminConfig {
  protectedRoutes: string[];
  password: string;
  closedRoutes: string[];
  routeMetadata: Record<string, Record<string, string>>;
}

interface MetaField {
  type: 'string' | 'number' | 'boolean';
  defaultValue: string;
}

interface AvailableRoutes {
  routes: {
    path: string;
    metaFields: Record<string, MetaField>;
  }[];
}

function getAdminConfig(): AdminConfig {
  const scriptProperties = PropertiesService.getScriptProperties();

  return {
    protectedRoutes:
      scriptProperties
        .getProperty(INTERNAL_METADATA.PROTECTED_ROUTES)
        ?.split(';')
        .filter((r) => r.trim()) || [],
    password:
      scriptProperties.getProperty(INTERNAL_METADATA.SITE_PASSWORD) || '',
    closedRoutes:
      scriptProperties
        .getProperty(INTERNAL_METADATA.CLOSED_ROUTES)
        ?.split(';')
        .filter((r) => r.trim()) || [],
    routeMetadata: JSON.parse(
      scriptProperties.getProperty(INTERNAL_METADATA.ROUTE_METADATA) || '{}'
    ),
  };
}

function setAdminConfig(config: AdminConfig) {
  const scriptProperties = PropertiesService.getScriptProperties();

  if (config.protectedRoutes) {
    scriptProperties.setProperty(
      INTERNAL_METADATA.PROTECTED_ROUTES,
      config.protectedRoutes.filter((r) => r.trim()).join(';')
    );
  }

  if (config.password) {
    scriptProperties.setProperty(
      INTERNAL_METADATA.SITE_PASSWORD,
      config.password
    );
  }

  if (config.closedRoutes) {
    scriptProperties.setProperty(
      INTERNAL_METADATA.CLOSED_ROUTES,
      config.closedRoutes.filter((r) => r.trim()).join(';')
    );
  }

  if (config.routeMetadata) {
    scriptProperties.setProperty(
      INTERNAL_METADATA.ROUTE_METADATA,
      JSON.stringify(config.routeMetadata)
    );
  }
}

function getAvailableRoutes(): AvailableRoutes {
  const manifest = getManifest();

  if (!manifest) {
    return { routes: [] };
  }

  const routes = Object.keys(manifest.routes);

  return {
    routes: routes.map((route) => {
      const manifest = getRouteManifest(route);
      const meta = manifest?.meta || {};

      return {
        path: route,
        metaFields: meta as Record<string, MetaField>,
      };
    }),
  };
}

/**
 * Opens the admin configuration UI in a modal dialog
 */
function openAdminUI() {
  const html = getRouteHTML('/admin', null, true);
  html.setWidth(900).setHeight(700);

  SpreadsheetApp.getUi().showModalDialog(html, 'Configuration');
}

export {
  openAdminUI,
  getAdminConfig,
  setAdminConfig,
  getAvailableRoutes,
  type AdminConfig,
  type AvailableRoutes,
};
