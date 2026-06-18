import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@layout': resolve(__dirname, 'src/layout'),
      '@panels': resolve(__dirname, 'src/panels'),
      '@ui': resolve(__dirname, 'src/ui'),
      '@modules': resolve(__dirname, 'src/modules'),
    },
  },
  server: {
    port: 3000,
  },
});
