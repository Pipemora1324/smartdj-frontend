import { readFileSync } from 'node:fs';
import js from '@eslint/js';
import globals from 'globals';

// Los archivos del sitio son scripts clásicos (sin módulos) que index.html carga en orden y que comparten
// sus funciones de nivel superior. Para no mantener una lista a mano, cada archivo recibe como globales
// las declaraciones de nivel superior de los demás.
const SITE_SCRIPTS = ['config.js', 'theme-init.js', 'ui-core.js', 'app.js', 'ui.js', 'console-core.js', 'dj-console.js'];
const TOP_LEVEL = /^(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;
const declared = Object.fromEntries(
  SITE_SCRIPTS.map((file) => [file, [...readFileSync(new URL(file, import.meta.url), 'utf8').matchAll(TOP_LEVEL)].map((m) => m[1])]),
);
const sharedFrom = (file) =>
  Object.fromEntries(
    SITE_SCRIPTS.filter((other) => other !== file)
      .flatMap((other) => declared[other])
      .map((name) => [name, 'readonly']),
  );
// Lo que llega por <script> de CDN o se publica en window desde ui-core.js y console-core.js.
const pageGlobals = { supabase: 'readonly', qrcode: 'readonly', SmartDJUI: 'readonly', SmartDJConsole: 'readonly' };

export default [
  { ignores: ['node_modules/'] },
  js.configs.recommended,
  ...SITE_SCRIPTS.map((file) => ({
    files: [file],
    languageOptions: {
      sourceType: 'script',
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...pageGlobals, ...sharedFrom(file) },
    },
    rules: {
      // Las funciones de nivel superior las usan otros archivos aunque aquí no aparezcan.
      'no-unused-vars': ['error', { vars: 'local', argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
    },
  })),
  {
    files: ['scripts/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { sourceType: 'module', ecmaVersion: 2024, globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }], eqeqeq: ['error', 'always'] },
  },
  // La prueba de humo ejecuta funciones dentro de la página (page.evaluate).
  { files: ['scripts/smoke.e2e.mjs'], languageOptions: { globals: { ...globals.browser, ...sharedFrom(null) } } },
];
