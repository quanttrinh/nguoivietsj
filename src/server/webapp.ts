import type { RoutePayload, RoutesManifest } from '~/types/routes';
import { isSessionAuthenticated } from './password';

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
  config: Partial<RoutesManifest>[string],
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
    `<meta name="base_url" content="${getServiceUrl()}">`,
    `<meta http-equiv="Content-Security-Policy" content="${cspRule}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<meta name="session_id" content="${sessionId}">`,
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

  // try {
  //   const cache = CacheService.getScriptCache();
  //   const cachedManifest = cache.get('routes-manifest');
  //   if (cachedManifest) {
  //     return JSON.parse(cachedManifest);
  //   } else {
  //     const manifest = loadManifest();
  //     if (manifest) {
  //       cache.put('routes-manifest', JSON.stringify(manifest), 21600); // Cache for 6 hours
  //       return manifest;
  //     } else {
  //       return null;
  //     }
  //   }
  // } catch (error) {
  //   Logger.log('Error getting routes manifest: ' + (error as Error).message);
  //   return null;
  // }
}

function getServiceUrl(): string {
  const cache = CacheService.getScriptCache();
  const cachedUrl = cache.get('service-url');
  if (cachedUrl) {
    return cachedUrl;
  }

  const url = ScriptApp.getService().getUrl();

  cache.put('service-url', url, 21600); // Cache for 6 hours
  return url;
}

function getRouteHTML(path: string, oldSessionId: string) {
  try {
    const manifest = getManifest();

    if (!manifest) {
      throw new Error('Could not load routes manifest');
    }

    const config = manifest[path];

    if (config) {
      // Get session ID from query parameter if provided (after auth), otherwise generate new one
      const sessionId = oldSessionId || Utilities.getUuid();

      // Check if the route is protected via Script Properties
      // const scriptProperties = PropertiesService.getScriptProperties();
      // const protectedRoutes = scriptProperties.getProperty('PROTECTED_ROUTES');

      const protectedRoutes = '/registration';

      if (protectedRoutes && path !== '/password-protector') {
        // Parse the protected routes (could be comma-separated or JSON array)
        const protectedPaths: string[] = protectedRoutes.split(';');

        // Check if current path is protected and the session is already authenticated
        if (
          protectedPaths.includes(path) &&
          (!oldSessionId || !isSessionAuthenticated(oldSessionId))
        ) {
          const passwordConfig = manifest['/password-protector'];

          if (!passwordConfig) {
            throw new Error('Password protector route not configured');
          }

          // Create a modified config with the target page in meta
          const modifiedConfig = {
            ...passwordConfig,
            meta: {
              ...(passwordConfig.meta || {}),
              target_page: path,
            },
          };

          return generateHTMLOutput(modifiedConfig, sessionId);
        }
      }

      return generateHTMLOutput(config, sessionId);
    }

    throw new Error('Route not found: ' + path);
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

export { doGet, doPost };
