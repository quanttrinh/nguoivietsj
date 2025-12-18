import { isSessionAuthenticated } from './password';
import { INTERNAL_METADATA, INTERNAL_SITES } from './constants';
import type { RoutePayload, RoutesManifest } from '~/types/routes';

function loadInternalFileContent(filename: string): string | undefined {
  try {
    // Treat the file as an HTML template and evaluate it to get the raw content
    const template = HtmlService.createTemplateFromFile(filename);
    return template.getRawContent();
  } catch (error) {
    Logger.log(
      'Error loading internal file ' +
        filename +
        ': ' +
        (error as Error).message
    );
  }
}

function generateHTMLOutput(
  config: Partial<{
    file: string;
    title: string;
    faviconUrl?: string;
    meta: Record<string, string>;
  }>,
  sessionId: string
): GoogleAppsScript.HTML.HtmlOutput {
  if (!config?.file) {
    throw new Error('Invalid route configuration');
  }

  const payloadContent = loadInternalFileContent('web/routes/' + config.file);

  if (!payloadContent) {
    throw new Error('Could not load route payload: ' + config.file);
  }

  const routePayload: RoutePayload = JSON.parse(payloadContent);

  const nonce = Utilities.base64EncodeWebSafe(Utilities.getUuid()).substring(
    0,
    16
  );

  const cspRule = `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; frame-src https://www.google.com;`;

  const payload = [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '<base target="_top">',
    `<meta http-equiv="Content-Security-Policy" content="${cspRule}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<meta name="BASE_URL" content="${getServiceUrl()}">`,
    `<meta name="SESSION_ID" content="${sessionId}">`,
    Object.entries(config.meta || {})
      .map(([name, content]) => {
        return `<meta name="${name}" content="${content}">`;
      })
      .join(''),
    `<script nonce="${nonce}" id="loader">`,
    `const __BUNDLER_JS_PAYLOAD__=${routePayload.loader.JSPayload || '""'};`,
    `const __BUNDLER_CSS_PAYLOAD__ =${routePayload.loader.cssPayload || '""'};`,
    routePayload.loader.mainLoader,
    `document.getElementById('loader')?.remove();`,
    '</script>',
    '</head>',
    '<body>',
    '<div id="root"></div>',
    '</body>',
    '</html>',
  ].join('');

  const output = HtmlService.createHtmlOutput()
    .append(payload)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setTitle(config.title || 'App');

  if (config.faviconUrl) {
    output.setFaviconUrl(config.faviconUrl);
  }

  return output;
}

function loadManifest(): Partial<RoutesManifest> | null {
  const manifestContent = loadInternalFileContent(
    'web/routes/manifest.json.html'
  );

  if (!manifestContent) {
    Logger.log('Could not load routes manifest content.');
    return null;
  }

  try {
    return JSON.parse(manifestContent);
  } catch (error) {
    Logger.log('Error parsing routes manifest: ' + (error as Error).message);
    return null;
  }
}

function getManifest(): Partial<RoutesManifest> | null {
  return loadManifest();
}

function getServiceUrl(): string {
  return ScriptApp.getService().getUrl();
}

function getRouteHTML(
  path: string,
  oldSessionId: string | null | undefined = '',
  allowInternal = false
): GoogleAppsScript.HTML.HtmlOutput {
  try {
    const manifest = getManifest();

    if (!manifest) {
      throw new Error('Could not load routes manifest');
    }

    const config = manifest[path];

    if (!config) {
      throw new Error('Route not found: ' + path);
    }

    // Get session ID from query parameter if provided (after auth), otherwise generate new one
    const sessionId =
      oldSessionId || Utilities.base64EncodeWebSafe(Utilities.getUuid());

    // Check if the route is protected via Script Properties
    const scriptProperties = PropertiesService.getScriptProperties();
    const protectedRoutes =
      scriptProperties.getProperty(INTERNAL_METADATA.PROTECTED_ROUTES) || '';
    const closedRoutes =
      scriptProperties.getProperty(INTERNAL_METADATA.CLOSED_ROUTES) || '';
    const routeMetadata = JSON.parse(
      scriptProperties.getProperty(INTERNAL_METADATA.ROUTE_METADATA) || '{}'
    );

    // Check if route is closed
    if (closedRoutes) {
      const closedPaths: string[] = closedRoutes
        .split(';')
        .filter((p) => p.trim());
      if (closedPaths.includes(path)) {
        return HtmlService.createHtmlOutput(
          [
            '<!DOCTYPE html>',
            '<html>',
            '<head>',
            '<style>:root,body{height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;}</style>',
            '</head>',
            '<body>',
            '<h1>Route Temporarily Closed</h1>',
            '<p>This page is currently unavailable.</p>',
            '</body>',
            '</html>',
          ].join('')
        )
          .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
          .setTitle('Route Closed');
      }
    }

    if (protectedRoutes) {
      // Parse the protected routes (could be comma-separated or JSON array)
      const protectedPaths: string[] = protectedRoutes.split(';');

      // Check if current path is protected and the session is already authenticated
      if (
        protectedPaths.includes(path) &&
        (!oldSessionId || !isSessionAuthenticated(oldSessionId))
      ) {
        const passwordConfig = manifest[INTERNAL_SITES.PASSWORD_PROTECTOR];

        if (!passwordConfig) {
          throw new Error('Password protector route not configured');
        }

        // Create a modified config with the target page in meta
        const modifiedConfig = {
          file: passwordConfig.file,
          title: passwordConfig.title,
          faviconUrl: passwordConfig.faviconUrl,
          meta: {
            ...Object.fromEntries(
              Object.entries(passwordConfig.meta || {}).map(([key, value]) => [
                key,
                String(value.defaultValue),
              ])
            ),
            ...routeMetadata[INTERNAL_SITES.PASSWORD_PROTECTOR],
            TARGET_PATH: path,
          },
        };

        return generateHTMLOutput(modifiedConfig, sessionId);
      }
    }

    if (
      !allowInternal &&
      Object.values(INTERNAL_SITES).includes(
        path as (typeof INTERNAL_SITES)[keyof typeof INTERNAL_SITES]
      )
    ) {
      throw new Error('Access to internal site is restricted: ' + path);
    }

    // Merge route metadata if configured
    const finalConfig = {
      file: config.file,
      title: config.title,
      faviconUrl: config.faviconUrl,
      meta: {
        ...Object.fromEntries(
          Object.entries(config.meta || {}).map(([key, value]) => [
            key,
            String(value.defaultValue),
          ])
        ),
        ...routeMetadata[path],
      },
    };

    return generateHTMLOutput(finalConfig, sessionId);
  } catch (error) {
    Logger.log(
      'Error serving static file for path ' +
        path +
        ': ' +
        (error as Error).message
    );

    return HtmlService.createHtmlOutput(
      [
        '<!DOCTYPE html>',
        '<html>',
        '<head>',
        '<style>',
        ':root,body{',
        'height:100%;',
        'display:flex;',
        'flex-direction:column;',
        'justify-content:center;',
        'align-items:center;',
        '}',
        '#error-container{',
        'display:flex;',
        'flex-direction:column;',
        'justify-content:center;',
        'align-items:center;',
        '}',
        '</style>',
        '</head>',
        '<body>',
        '<div id="error-container">',
        '<h1>Failed to load application</h1>',
        `<p style="color:#666;font-size:0.9em;">Error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }</p>`,
        '</div>',
        '</body>',
        '</html>',
      ].join('')
    )
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setTitle('Error');
  }
}

function doGet(e: GoogleAppsScript.Events.DoGet) {
  const path = `/${e.pathInfo || ''}`;
  const sessionId = e.parameter?.session_id || '';
  return getRouteHTML(path, sessionId);
}

function doPost(e: GoogleAppsScript.Events.DoPost) {
  // TODO
}

export { doGet, doPost, getRouteHTML, getManifest };
