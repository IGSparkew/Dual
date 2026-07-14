import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDirtyState, registerIpcHandlers } from './ipc';
import { buildMenu } from './menu';
import { registerDualProtocolHandler, registerDualSchemePrivileges } from './protocol';
import { ensureUserDirs, seedUserDirs } from './userdata';

// Main is emitted as ESM (package.json "type": "module") — no native __dirname.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = !!process.env.VITE_DEV_SERVER_URL;

registerDualSchemePrivileges();

// Tracks the current window so `dual:confirm-saved` can resolve a pending
// close after the renderer finishes saving in response to `menu:save-project`.
let mainWindow: BrowserWindow | null = null;
// Set once the user picked "Save" in the close-confirmation dialog: the next
// `close` on this window (triggered by `win.destroy()` below) must not
// re-open that dialog, and `dual:confirm-saved` must only act while this is true.
let closeRequested = false;

function createWindow(): BrowserWindow {
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

  mainWindow = win;
  attachCloseHandler(win);

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL!);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  return win;
}

function attachCloseHandler(win: BrowserWindow): void {
  win.on('close', (event) => {
    if (closeRequested) return; // save flow already confirmed — let it close
    if (!getDirtyState()) return; // nothing unsaved — close normally

    event.preventDefault();
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      message: 'Save changes before closing?',
    });

    if (choice === 0) {
      closeRequested = true;
      win.webContents.send('menu:save-project');
    } else if (choice === 1) {
      closeRequested = true;
      win.destroy();
    }
    // choice === 2 (Cancel): nothing else to do, preventDefault already stopped the close.
  });
}

app.whenReady().then(() => {
  ensureUserDirs();
  seedUserDirs();
  registerIpcHandlers();
  registerDualProtocolHandler();

  // Only WAV export triggers a download in this app (via renderPatternAudio's
  // <a download> link) — a single permanent listener is enough, no need to
  // arm/disarm it around the export click.
  session.defaultSession.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({
      defaultPath: item.getFilename(),
      filters: [{ name: 'WAV Audio', extensions: ['wav'] }],
    });
  });

  const win = createWindow();
  buildMenu(win);

  // Ack sent by the renderer once the save triggered by the close flow settles
  // (whether it actually wrote a file or the user cancelled the Save As dialog).
  // Always clears `closeRequested` so a cancelled save doesn't leave the window
  // stuck refusing to close on every subsequent attempt; only destroys on success.
  ipcMain.handle('dual:confirm-saved', (_event, saved: boolean) => {
    if (!closeRequested) return; // no close pending — no-op
    closeRequested = false;
    if (saved) mainWindow?.destroy();
  });
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const win = createWindow();
    buildMenu(win);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
