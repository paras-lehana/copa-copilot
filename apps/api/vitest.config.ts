import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Tests run against core SOURCE so the suite never depends on a stale build.
      '@copa/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    hookTimeout: 30_000, // Windows ESM transform startup headroom (documented flake fix)
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
});
