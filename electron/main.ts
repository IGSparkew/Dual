import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers } from './ipc';
import { registerDualProtocolHandler, registerDualSchemePrivileges } from './protocol';
import { ensureUserDirs, seedUserDirs } from './userdata';

// Main is emitted as ESM (package.json "type": "module") — no native __dirname.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = !!process.env.VITE_DEV_SERVER_URL;

registerDualSchemePrivileges();

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      // vite-plugin-electron emits the preload as CJS named .mjs — fine for the
      // (default) sandboxed renderer, which evaluates it with a polyfilled require.
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL!);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  ensureUserDirs();
  seedUserDirs();
  registerIpcHandlers();
  registerDualProtocolHandler();
  createWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
