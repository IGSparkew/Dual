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
    coverage: {
      provider: 'v8',
      // `lcov` writes coverage/lcov.info, the only format SonarQube reads for
      // JS/TS (sonar.javascript.lcov.reportPaths in sonar-project.properties).
      // `text` keeps a human-readable summary in the CI log.
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      // `include` MUST stay set: when it is null the v8 provider only reports
      // files a test actually imported (see coverage-v8's provider.js —
      // getCoverageMapForUncoveredFiles is skipped). Most of the codebase has
      // no test at all, so SonarQube would then read coverage over that tested
      // subset only and report a wildly optimistic figure. Listing the source
      // globs forces untested files into the report at 0 %.
      // Keep in sync with sonar.sources / sonar.coverage.exclusions.
      include: [
        'src/**/*.{ts,tsx}',
        'modules/**/*.{ts,tsx}',
        'electron/**/*.ts',
        'scripts/**/*.{js,mjs}',
      ],
      exclude: [
        // Tests live both under tests/ and next to the code they cover.
        '**/*.test.ts',
        // Ambient declarations carry no runtime code.
        '**/*.d.ts',
      ],
    },
  },
});
