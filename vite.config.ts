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
    rollupOptions: {
      output: {
        // StrudelBridgeImpl.ts and AudioExporterImpl.ts each do their own
        // `await import('@strudel/webaudio')`. Without this, Rollup's default
        // chunking splits superdough/@strudel/webaudio into two separate
        // dynamic-import chunks instead of sharing one — two independent copies
        // of the module, each with its own AudioContext/controller singleton.
        // superdough() then resolves orbit effect nodes against whichever copy
        // ends up live, while renderPatternAudio's OfflineAudioContext swap
        // happens on the other, so connecting them throws "cannot connect to
        // an AudioNode belonging to a different audio context" and the hap is
        // silently dropped from the export. Forcing both into one chunk
        // guarantees a single module instance.
        manualChunks(id) {
          if (id.includes('node_modules/superdough') || id.includes('node_modules/@strudel/webaudio')) {
            return 'strudel-audio-engine';
          }
        },
      },
    },
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
    // Same duplicate-singleton risk as the manualChunks fix above, but for
    // `npm run dev`: esbuild's dep pre-bundling (not Rollup) is what resolves
    // modules there, so it needs its own guard against two copies of
    // superdough's AudioContext/controller state.
    dedupe: ['superdough', '@strudel/core'],
  },
  optimizeDeps: {
    // @strudel/webaudio is only ever reached via top-level `await import(...)`
    // (StrudelBridgeImpl, AudioExporterImpl), so esbuild's initial dependency
    // scan can miss it and pre-bundle it later, mid-session, as a second copy
    // alongside the one already in the graph — the same split that
    // manualChunks prevents at build time. Listing it explicitly forces it
    // into the first scan instead.
    include: ['superdough', '@strudel/webaudio'],
  },
  server: {
    port: 3000,
  },
});
