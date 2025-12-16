// @ts-check

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import path from 'path';

import { defineConfig } from 'eslint/config';
import tsEslint from 'typescript-eslint';
import googleappsscript from 'eslint-plugin-googleappsscript';
import globals from 'globals';

const TypeScriptConfig = defineConfig({
  extends: [tsEslint.configs.recommended, tsEslint.configs.stylistic],
  languageOptions: {
    parserOptions: {
      ecmaVersion: '2019',
      sourceType: 'module',
    },
  },
});

export default defineConfig([
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    name: 'TypeScript',
    basePath: path.resolve(__dirname, 'src', 'server'),
    files: ['**/*.ts'],
    extends: [TypeScriptConfig],
    plugins: {
      googleappsscript,
    },
    languageOptions: {
      globals: {
        ...globals.node,
        ...googleappsscript.environments.googleappsscript.globals,
      },
    },
  },
  {
    name: 'TSX',
    files: ['**/*.t{s},sx}'],
    basePath: path.resolve(__dirname, 'src', 'client'),
    extends: [TypeScriptConfig],
  },
]);
