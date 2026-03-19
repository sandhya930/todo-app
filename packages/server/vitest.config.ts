import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      exclude: ['**/node_modules/**', '**/src/index.ts', '**/src/routes/**', '**/dist/**'],
      thresholds: { lines: 80, functions: 80, branches: 80 },
    },
  },
});
