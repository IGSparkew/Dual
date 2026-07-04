import { contextBridge, ipcRenderer } from 'electron';

// Renderer-side type lives in src/core/types/desktop.ts (window.dualDesktop).
contextBridge.exposeInMainWorld('dualDesktop', {
  getPaths: () => ipcRenderer.invoke('dual:paths'),
  listUserDir: (subdir: string) => ipcRenderer.invoke('dual:list-user-dir', subdir),
});
