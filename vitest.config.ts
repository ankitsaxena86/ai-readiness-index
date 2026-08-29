import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pure-logic tests for the scoring engine. These must never import 'vscode'.
    include: ['src/**/*.vitest.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/engine/**'],
      reporter: ['text', 'html'],
    },
  },
});
