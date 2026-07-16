import { contextBridge, ipcRenderer } from 'electron';

// Renderer-side type lives in src/core/types/desktop.ts (window.dualDesktop).

// Mirrors PackProgress in src/core/types/desktop.ts — kept local (this file
// isn't part of the tsconfig project that resolves the @core alias, same as
// the other electron/*.ts files, e.g. ProjectFile duplicated in ipc.ts).
interface PackProgress {
  packId: string;
  phase: 'downloading' | 'verifying' | 'extracting' | 'done' | 'error';
  receivedBytes: number;
  totalBytes: number;
  message?: string;
}
const MENU_ACTIONS = [
  'new-project',
  'open-project',
  'open-last-project',
  'save-project',
  'save-as-project',
  'export-wav',
  'copy-strudel-link',
  'git-commit',
  'git-push',
  'git-pull',
  'git-set-remote',
] as const;
type MenuAction = (typeof MENU_ACTIONS)[number];

contextBridge.exposeInMainWorld('dualDesktop', {
  getPaths: () => ipcRenderer.invoke('dual:paths'),
  listUserDir: (subdir: string) => ipcRenderer.invoke('dual:list-user-dir', subdir),
  getPackStates: () => ipcRenderer.invoke('dual:get-pack-states'),
  installPack: (packId: string) => ipcRenderer.invoke('dual:install-pack', packId),
  uninstallPack: (packId: string) => ipcRenderer.invoke('dual:uninstall-pack', packId),
  onPackProgress: (callback: (p: PackProgress) => void) => {
    const listener = (_e: unknown, p: PackProgress) => callback(p);
    ipcRenderer.on('pack:progress', listener);
    return () => ipcRenderer.removeListener('pack:progress', listener);
  },
  openProjectDialog: () => ipcRenderer.invoke('dual:open-project-dialog'),
  saveProjectDialog: (code: string) => ipcRenderer.invoke('dual:save-project-dialog', code),
  writeFile: (path: string, code: string) => ipcRenderer.invoke('dual:write-file', path, code),
  getLastProject: () => ipcRenderer.invoke('dual:get-last-project'),
  readProjectFile: (path: string) => ipcRenderer.invoke('dual:read-project-file', path),
  setLastProject: (path: string | null) => ipcRenderer.invoke('dual:set-last-project', path),
  setDirty: (dirty: boolean) => ipcRenderer.invoke('dual:set-dirty', dirty),
  confirmSaved: (saved: boolean) => ipcRenderer.invoke('dual:confirm-saved', saved),
  gitCommit: (projectPath: string, message: string) =>
    ipcRenderer.invoke('dual:git-commit', projectPath, message),
  gitPush: (projectPath: string) => ipcRenderer.invoke('dual:git-push', projectPath),
  gitFindRepoRoot: (projectPath: string) =>
    ipcRenderer.invoke('dual:git-find-repo-root', projectPath),
  gitPull: (projectPath: string) => ipcRenderer.invoke('dual:git-pull', projectPath),
  gitSetRemote: (projectPath: string, url: string) =>
    ipcRenderer.invoke('dual:git-set-remote', projectPath, url),
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
