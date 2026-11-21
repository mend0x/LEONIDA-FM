import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
export default [
  { ignores: ['dist/**', 'node_modules/**', 'docs/**', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.serviceworker } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
