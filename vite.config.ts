import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import { resolve } from 'path';

// Electron-based editors (VSCode…) leak this into child processes, which makes
// the spawned Electron run as plain Node and crash on `import 'electron'`.
delete process.env.ELECTRON_RUN_AS_NODE;

export default defineConfig({
  base: './', // relative asset paths — required for file:// loading in production
  build: {
    // Don't copy public/samples (2.7 GB) into dist/ — the packaged app ships it
    // via electron-builder extraResources and serves it through dual://core/samples/.
    copyPublicDir: false,
  },
  plugins: [
    react(),
    electron({
      main: { entry: 'electron/main.ts' },
      preload: { input: resolve(__dirname, 'electron/preload.ts') },
    }),
  ],
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@layout': resolve(__dirname, 'src/layout'),
      '@ui': resolve(__dirname, 'src/ui'),
      '@modules': resolve(__dirname, 'modules'),
    },
  },
  server: {
    port: 3000,
  },
});
