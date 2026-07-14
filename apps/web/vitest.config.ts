import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Tests don't render real CSS; skip PostCSS/Tailwind to keep jsdom runs fast + isolated.
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: {
      '@copa/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/__tests__/**/*.test.{ts,tsx}', 'lib/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['components/**/*.tsx', 'lib/**/*.ts'],
      exclude: ['**/*.test.*'],
      thresholds: { lines: 55, statements: 55, functions: 50, branches: 50 },
    },
  },
});
