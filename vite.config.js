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
import htmlMinifier from 'vite-plugin-html-minifier';

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
  return {
    name: 'build-routes',
    apply: 'build',

    async generateBundle() {
      // Extract the loader code from the bundle output
      const loaderCode = await (async () => {
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
            rollupOptions: {
              input: loaderPath,
              output: {
                format: 'iife',
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

        if (Array.isArray(loaderBundle)) {
          const output = loaderBundle[0];
          if ('output' in output) {
            const chunk = output.output.find(
              (item) => item.type === 'chunk' && item.fileName === 'loader.js'
            );
            if (chunk && chunk.type === 'chunk') {
              return chunk.code;
            }
          }
        } else if ('output' in loaderBundle) {
          const chunk = loaderBundle.output.find(
            (item) => item.type === 'chunk' && item.fileName === 'loader.js'
          );
          if (chunk && chunk.type === 'chunk') {
            return chunk.code;
          }
        }
      })();

      if (!loaderCode) {
        this.error('Failed to extract loader code from build output');
        return;
      }

      this.info('Loader script built successfully');

      // Find all route entry points
      const routes = await glob('routes/**/index.tsx', {
        cwd: path.resolve(__dirname, 'src', 'web'),
        absolute: true,
      });

      this.info(`Found ${routes.length} routes to build`);

      const processedRoutes = await Promise.all(
        routes.map(
          (routePath) =>
            /** @type {Promise<{ routeName: string; routeFileName: string, rawSize: number, compressedSize: number }>} */
            (
              new Promise(async (resolve, reject) => {
                // Build the route
                const routeBundle = await viteBuild({
                  base: '/web/',
                  build: {
                    target: 'baseline-widely-available',
                    rollupOptions: {
                      input: routePath,
                      output: {
                        format: 'esm',
                        inlineDynamicImports: true,
                      },
                      preserveEntrySignatures: 'strict',
                    },
                    write: false,
                  },
                  configFile: false,
                  publicDir: false,
                  plugins: /** @type {import('vite').PluginOption[]} */ ([
                    tsconfigPaths(),
                    solidDevtools(),
                    solidPlugin(),
                    tailwindcss(),
                  ]),
                });

                // Extract bundle output
                const routeOutputs = (() => {
                  if (Array.isArray(routeBundle)) {
                    return routeBundle[0]?.output || [];
                  } else if ('output' in routeBundle) {
                    return routeBundle.output;
                  }
                })();

                if (
                  !routeOutputs ||
                  routeOutputs.length < 1 ||
                  routeOutputs.length > 2
                ) {
                  this.error('Failed to build route');
                  reject();
                  return;
                }

                const jsCode =
                  /** @type {import('vite').Rollup.OutputChunk | undefined} */ (
                    routeOutputs.find(
                      (item) =>
                        item.type === 'chunk' && item.fileName.endsWith('.js')
                    )
                  )?.code || '';
                const jsPayload = yencStringify(
                  yencDynEncode(
                    new Uint8Array(zlib.gzipSync(Buffer.from(jsCode))),
                    '"'
                  )
                );

                const cssCode =
                  /** @type {import('vite').Rollup.OutputAsset | undefined} */ (
                    routeOutputs.find(
                      (item) =>
                        item.type === 'asset' && item.fileName.endsWith('.css')
                    )
                  )?.source || '';
                const cssPayload = yencStringify(
                  yencDynEncode(
                    new Uint8Array(zlib.gzipSync(Buffer.from(cssCode))),
                    '"'
                  )
                );

                // Read route config
                /** @type {Partial<Pick<import('./src/types/routes').RouteManifest, 'title' | 'meta' | 'faviconUrl'>>} */
                let routeConfig = {
                  title: path.basename(path.dirname(routePath)),
                };
                try {
                  const configPath = path.join(
                    path.dirname(routePath),
                    'index.json'
                  );
                  const configContent = await fs.readFile(configPath, 'utf-8');
                  routeConfig = {
                    ...routeConfig,
                    ...JSON.parse(configContent),
                  };
                } catch {
                  // Use defaults
                }

                /** @type {import('./src/types/routes').RouteManifest} */
                const routeManifest = {
                  title: routeConfig.title || 'Untitled Route',
                  faviconUrl: routeConfig.faviconUrl,
                  meta: routeConfig.meta || {},
                  jsPayload: jsPayload,
                  cssPayload: cssPayload || undefined,
                };

                // Emit route manifest file
                const routeName = path
                  .relative(
                    path.resolve(__dirname, 'src', 'web', 'routes'),
                    path.dirname(routePath)
                  )
                  .replace(/\\/g, '/'); // Normalize Windows paths

                const routeFileName = `web/routes/${routeName}.index.json.html`;
                this.emitFile({
                  type: 'asset',
                  fileName: routeFileName,
                  source: JSON.stringify(routeManifest),
                });

                resolve({
                  routeName,
                  routeFileName,
                  rawSize: jsCode.length + cssCode.length + loaderCode.length,
                  compressedSize:
                    jsPayload.length + cssPayload.length + loaderCode.length,
                });
              })
            )
        )
      );

      this.info('All routes built successfully!');

      const manifest = {
        loader: loaderCode,
        routes: processedRoutes.reduce((acc, route) => {
          acc[`/${route.routeName}`] = route.routeFileName;
          this.info(
            `Built route: ${route.routeName} (Raw size: ${route.rawSize} -> Compressed size: ${route.compressedSize})`
          );
          return acc;
        }, /** @type {Record<string, string>} */ ({})),
      };

      // Emit the manifest
      this.emitFile({
        type: 'asset',
        fileName: 'web/routes/manifest.json.html',
        source: JSON.stringify(manifest),
      });
    },
  };
};

/**
 * Plugin to minify HTML templates and copy them to dist
 * Uses Vite's built-in build process for HTML minification
 * @returns {import('vite').Plugin}
 */
const MinifyTemplatesPlugin = () => ({
  name: 'minify-templates',
  apply: 'build',

  async generateBundle() {
    // Find all HTML template files
    const templates = await glob('templates/**/*.html', {
      cwd: path.resolve(__dirname, 'src'),
      absolute: true,
    });

    this.info(`Found ${templates.length} HTML template(s) to minify`);

    // Process each template
    for (const templatePath of templates) {
      // Get relative path for output
      const relativePath = path.relative(
        path.resolve(__dirname, 'src', 'templates'),
        templatePath
      );

      this.info(`Minifying template: ${relativePath}`);

      // Build HTML with minification using vite-plugin-minify
      const result = await viteBuild({
        build: {
          outDir: path.resolve(__dirname, 'dist', 'server', 'templates'),
          emptyOutDir: false,
          rollupOptions: {
            input: templatePath,
          },
          write: false,
          cssMinify: 'lightningcss',
        },
        css: {
          transformer: 'lightningcss',
          lightningcss: {
            // Target older browsers for email client compatibility
            targets: {
              // Support email clients (use very conservative targets)
              safari: (11 << 16) | (1 << 8), // Safari 11.1 (iOS Mail)
              chrome: 70 << 16, // Chrome 70
              edge: 79 << 16, // Edge 79
              firefox: 60 << 16, // Firefox 60
            },
          },
        },
        configFile: false,
        publicDir: false,
        plugins: [
          htmlMinifier({
            minify: true,
          }),
        ],
      });

      // Extract the built HTML content
      let minifiedContent = '';
      if (Array.isArray(result)) {
        const output = result[0];
        if ('output' in output) {
          const asset = output.output.find(
            (item) => item.type === 'asset' || item.type === 'chunk'
          );
          if (asset) {
            if (asset.type === 'asset') {
              minifiedContent =
                typeof asset.source === 'string'
                  ? asset.source
                  : new TextDecoder().decode(asset.source);
            } else if (asset.type === 'chunk') {
              minifiedContent = asset.code;
            }
          }
        }
      } else if ('output' in result) {
        const asset = result.output.find(
          (item) => item.type === 'asset' || item.type === 'chunk'
        );
        if (asset) {
          if (asset.type === 'asset') {
            minifiedContent =
              typeof asset.source === 'string'
                ? asset.source
                : new TextDecoder().decode(asset.source);
          } else if (asset.type === 'chunk') {
            minifiedContent = asset.code;
          }
        }
      }

      if (!minifiedContent) {
        this.error('Failed to extract minified content from build output');
      }

      // Emit the minified template
      this.emitFile({
        type: 'asset',
        fileName: `server/templates/${relativePath}`,
        source: minifiedContent,
      });
    }
  },
});

export default defineConfig(({ command }) => ({
  plugins: /** @type {import('vite').PluginOption[]} */ ([
    ExposeGasFunctionsPlugin(),
    command === 'build' ? [RoutesBuildPlugin(), MinifyTemplatesPlugin()] : [],
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
}));
