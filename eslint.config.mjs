// ESLint flat config covering EVERY workspace (core, api, web, e2e, scripts).
// House rules are errors, not warnings — the repo stays grep-clean by construction.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'docs/**',
      'infra/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // The web app logs nothing either; Next's own tooling handles its build output.
    files: ['apps/web/**/*.tsx', 'apps/web/**/*.ts'],
    rules: {
      'no-console': 'error',
    },
  },
  {
    // Test files may use devDependency imports but keep the same quality bar.
    files: ['**/*.test.ts', '**/*.test.tsx', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
