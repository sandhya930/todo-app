import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      thresholds: { lines: 80, functions: 80, branches: 80 },
      exclude: [
        'src/test-setup.ts',
        'src/main.tsx',
        // Config files — no testable logic
        'vite.config.ts',
        'vitest.integration.config.ts',
        // Covered by integration tests, not unit tests
        'src/components/views/**',
        'src/hooks/**',
        // Zustand store definition — no functions to unit-test
        'src/stores/**',
      ],
    },
  },
  resolve: {
    alias: { '@': '/src' },
  },
});
