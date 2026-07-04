import { app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Main is emitted as ESM (package.json "type": "module") — no native __dirname.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Folder the app "lives in": repo root in dev, executable folder when packaged. */
export function getPortableRoot(): string {
  return app.isPackaged ? path.dirname(app.getPath('exe')) : path.resolve(__dirname, '..');
}

/** Read-only core resources root: resources/ (extraResources) when packaged, repo root in dev. */
export function getCoreRoot(): string {
  return app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..');
}

export function getCoreLayoutsDir(): string {
  return path.join(getCoreRoot(), 'layouts');
}

/** Dev reads the same tree Vite serves at /samples (public/samples). */
export function getCoreSamplesDir(): string {
  return app.isPackaged
    ? path.join(getCoreRoot(), 'samples')
    : path.join(getCoreRoot(), 'public', 'samples');
}

/** Writable per-install data, next to the executable (portable-app layout). */
export function getUserDataRoot(): string {
  return path.join(getPortableRoot(), 'userdata');
}
