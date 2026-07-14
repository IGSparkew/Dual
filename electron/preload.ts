import { contextBridge, ipcRenderer } from 'electron';

// Renderer-side type lives in src/core/types/desktop.ts (window.dualDesktop).
const MENU_ACTIONS = [
  'new-project',
  'open-project',
  'save-project',
  'save-as-project',
  'export-wav',
  'copy-strudel-link',
  'export-file',
  'git-commit',
  'git-push',
] as const;
type MenuAction = (typeof MENU_ACTIONS)[number];

contextBridge.exposeInMainWorld('dualDesktop', {
  getPaths: () => ipcRenderer.invoke('dual:paths'),
  listUserDir: (subdir: string) => ipcRenderer.invoke('dual:list-user-dir', subdir),
  openProjectDialog: () => ipcRenderer.invoke('dual:open-project-dialog'),
  saveProjectDialog: (code: string) => ipcRenderer.invoke('dual:save-project-dialog', code),
  writeFile: (path: string, code: string) => ipcRenderer.invoke('dual:write-file', path, code),
  getLastProject: () => ipcRenderer.invoke('dual:get-last-project'),
  setLastProject: (path: string | null) => ipcRenderer.invoke('dual:set-last-project', path),
  setDirty: (dirty: boolean) => ipcRenderer.invoke('dual:set-dirty', dirty),
  confirmSaved: (saved: boolean) => ipcRenderer.invoke('dual:confirm-saved', saved),
  gitCommit: (message: string) => ipcRenderer.invoke('dual:git-commit', message),
  gitPush: () => ipcRenderer.invoke('dual:git-push'),
  onMenuAction: (action: MenuAction, callback: () => void) => {
    if (!MENU_ACTIONS.includes(action)) {
      throw new Error(`Unknown menu action: ${action}`);
    }
    const channel = `menu:${action}`;
    const listener = () => callback();
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
