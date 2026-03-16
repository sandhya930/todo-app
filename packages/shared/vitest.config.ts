import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Exclude barrel/schema files — no testable logic, just type/config exports
      exclude: ['**/node_modules/**', 'src/index.ts', 'src/db/client-schema.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80 },
    },
  },
});
