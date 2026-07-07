import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Standalone Vitest config: vite.config.ts carries the vite-plugin-electron
// setup, which must not run (or spawn Electron) inside the test runner. Only
// the path aliases are shared.
export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@layout': resolve(__dirname, 'src/layout'),
      '@ui': resolve(__dirname, 'src/ui'),
      '@modules': resolve(__dirname, 'modules'),
    },
  },
  test: {
    // Workaround: with vitest 4.1 on Node 25.8 the forks/threads pools lose
    // the runner state (`describe` throws "Cannot read properties of
    // undefined (reading 'config')" in every file, even a trivial one).
    // vmThreads is unaffected and is fine for our pure unit tests.
    pool: 'vmThreads',
  },
});
