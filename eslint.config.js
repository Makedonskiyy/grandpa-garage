import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  // .claude — локальные скиллы и инструменты Claude Code (чужой код, в git не входит).
  { ignores: ['dist/', 'node_modules/', 'coverage/', '.claude/'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  {
    files: ['tests/**/*.js', '*.config.js', 'tools/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Консольные утилиты пишут результат в терминал.
    files: ['tools/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
  prettier,
];
