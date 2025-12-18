// @ts-check

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

import { defineConfig, build as viteBuild } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import solidPlugin from 'vite-plugin-solid';
import solidDevtools from 'solid-devtools/vite';
import tailwindcss from '@tailwindcss/vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

import { glob } from 'glob';
import zlib from 'zlib';
import {
  stringify as yencStringify,
  dynamicEncode as yencDynEncode,
} from 'simple-yenc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Author: Amit Agarwal (amit@labnol.org)
 * Description: This is a custom Vite plugin to expose the functions from the bundled IIFE module
 * to the global scope. This is necessary for Google Apps Script to call
 * functions like onOpen(e) or other custom functions directly.
 * @returns {import('vite').Plugin}
 */
const ExposeGasFunctionsPlugin = () => ({
  name: 'expose-gas-functions',
  generateBundle(options, bundle) {
    const entryChunk = Object.values(bundle).find(
      (chunk) => chunk.type === 'chunk' && chunk.isEntry
    );

    if (entryChunk && entryChunk.type === 'chunk') {
      const exposureCode = entryChunk.exports
        .map(
          (fnName) =>
            `function ${fnName}() { return ${options.name}.${fnName}.apply(this, arguments); }`
        )
        .join('\n');
      entryChunk.code += `${exposureCode}`;
    }
  },
});

/**
 * @returns {import('vite').Plugin}
 */
const RoutesBuildPlugin = () => {
  // Store loader code in closure to share across route builds
  let loaderCode = '';

  return {
    name: 'build-routes',
    apply: 'build',

    async generateBundle() {
      // Build the loader script once before building routes
      this.info('Building loader script...');

      const loaderPath = path.resolve(
        __dirname,
        'src',
        'web',
        'common',
        'loader.ts'
      );

      // Build the loader using Vite and capture output in memory
      const loaderBundle = await viteBuild({
        build: {
          target: 'baseline-widely-available',
          modulePreload: false,
          rollupOptions: {
            input: loaderPath,
            output: {
              format: 'es',
              entryFileNames: 'loader.js',
              inlineDynamicImports: true,
            },
          },
          write: false, // Don't write to disk
        },
        configFile: false,
        publicDir: false,
        plugins: [],
      });

      // Extract the loader code from the bundle output
      if (Array.isArray(loaderBundle)) {
        const output = loaderBundle[0];
        if ('output' in output) {
          const chunk = output.output.find(
            (item) => item.type === 'chunk' && item.fileName === 'loader.js'
          );
          if (chunk && chunk.type === 'chunk') {
            loaderCode = chunk.code;
          }
        }
      } else if ('output' in loaderBundle) {
        const chunk = loaderBundle.output.find(
          (item) => item.type === 'chunk' && item.fileName === 'loader.js'
        );
        if (chunk && chunk.type === 'chunk') {
          loaderCode = chunk.code;
        }
      }

      if (!loaderCode) {
        this.error('Failed to extract loader code from build output');
      }

      this.info('Loader script built successfully');

      // Find all route entry points
      const routes = await glob('routes/**/index.tsx', {
        cwd: path.resolve(__dirname, 'src', 'web'),
        absolute: true,
      });

      this.info(`Found ${routes.length} routes to build`);

      /** @type {import('./src/types/routes').RoutesManifest} */
      const manifest = {};

      // Build each route separately in parallel
      const buildPromises = routes.map(async (routePath) => {
        // Get route name from path (e.g., routes/error/index.tsx -> error)
        const rel = path.relative(
          path.resolve(__dirname, 'src', 'web', 'routes'),
          routePath
        );
        const routeName = path.dirname(rel).replace(/\\/g, '/'); // Normalize for Windows

        this.info(`Building route: ${routeName}`);

        await viteBuild({
          build: {
            target: 'baseline-widely-available',
            outDir: path.resolve(__dirname, 'dist', 'web', 'routes'),
            emptyOutDir: false,
            rollupOptions: {
              input: {
                [routeName]: routePath,
              },
              output: {
                entryFileNames: `${routeName}/index.js`,
                assetFileNames: `${routeName}/[name].[ext]`,
              },
            },
            reportCompressedSize: false,
          },
          configFile: false,
          publicDir: false,
          plugins: /** @type {import('vite').PluginOption[]} */ ([
            tsconfigPaths(),
            solidDevtools(),
            solidPlugin(),
            tailwindcss(),
            {
              name: 'create-html',

              async generateBundle(_, bundle) {
                // Find the JS and CSS files for this route
                let jsCode = '';
                let cssCode = '';

                for (const [fileName, asset] of Object.entries(bundle)) {
                  if (fileName.endsWith('.js') && asset.type === 'chunk') {
                    jsCode = asset.code;
                  } else if (
                    fileName.endsWith('.css') &&
                    asset.type === 'asset'
                  ) {
                    cssCode =
                      typeof asset.source === 'string'
                        ? asset.source
                        : new TextDecoder().decode(asset.source);
                  }
                }

                // Calculate total uncompressed size
                const uncompressedSize =
                  (jsCode?.length || 0) + (cssCode?.length || 0);

                const jsPayloadStr = `"${yencStringify(
                  yencDynEncode(
                    new Uint8Array(zlib.gzipSync(Buffer.from(jsCode))),
                    '"'
                  )
                )}"`;

                const cssPayloadStr = `"${yencStringify(
                  yencDynEncode(
                    new Uint8Array(zlib.gzipSync(Buffer.from(cssCode))),
                    '"'
                  )
                )}"`;

                // Use the pre-built loader template from memory
                if (!loaderCode) {
                  this.error('Loader code not available');
                }

                const compressedSize =
                  loaderCode.length +
                  jsPayloadStr.length +
                  cssPayloadStr.length;

                this.info(
                  `${routeName}: Compression: ~${uncompressedSize.toLocaleString()} → ~${compressedSize.toLocaleString()} (${((1 - compressedSize / uncompressedSize) * 100).toFixed(1)}% reduction)`
                );

                // Read route config for title (if exists)
                let routeConfig = { title: routeName };
                try {
                  const configPath = path.join(
                    path.dirname(routePath),
                    'index.json'
                  );
                  const configContent = await fs.readFile(configPath, 'utf-8');
                  const parsedConfig = JSON.parse(configContent);
                  routeConfig = {
                    ...routeConfig,
                    ...parsedConfig,
                  };
                } catch {
                  this.warn(
                    `${routeName}: No index.json found, using defaults`
                  );
                }

                manifest[`/${routeName}`] = {
                  file: `${routeName}/index.json.html`,
                  title: routeConfig.title,
                  faviconUrl: routeConfig.faviconUrl,
                  meta: routeConfig.meta || {},
                };

                /** @type {import('./src/types/routes').RoutePayload} */
                const routePayload = {
                  loader: {
                    mainLoader: loaderCode,
                    cssPayload: cssPayloadStr,
                    JSPayload: jsPayloadStr,
                  },
                };

                // Add the HTML file to the bundle (preserve folder structure)
                this.emitFile({
                  type: 'asset',
                  fileName: `${routeName}/index.json.html`,
                  source: JSON.stringify(routePayload),
                });

                // Remove the JS and CSS files from the bundle
                for (const fileName of Object.keys(bundle)) {
                  if (fileName.endsWith('.js') || fileName.endsWith('.css')) {
                    delete bundle[fileName];
                  }
                }
              },
            },
          ]),
        });
      });

      // Wait for all routes to build in parallel
      await Promise.all(buildPromises);

      // Write manifest file
      this.emitFile({
        type: 'asset',
        fileName: 'web/routes/manifest.json.html',
        source: JSON.stringify(manifest, null, 2),
      });

      this.info('All routes built successfully');
    },
  };
};

export default defineConfig(({ command, mode }) => ({
  plugins: /** @type {import('vite').PluginOption[]} */ ([
    ExposeGasFunctionsPlugin(),
    command === 'build' ? RoutesBuildPlugin() : [],
    viteStaticCopy({
      targets: [
        {
          src: 'appsscript.json',
          dest: '.',
        },
      ],
    }),
  ]),
  build: {
    target: ['es2019'],
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, 'src', 'server', 'index.js'),
      fileName: 'index',
      name: 'globalThis',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        entryFileNames: 'server/[name].js',
      },
    },
    reportCompressedSize: false,
  },
  server: {
    open: true, // Auto-open browser
    hmr: {
      overlay: true,
    },
    watch: {
      usePolling: false,
    },
  },
}));
