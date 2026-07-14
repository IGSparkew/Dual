/**
 * Bridge exposed by the Electron preload (window.dualDesktop).
 * Absent when running in a plain browser — always feature-detect.
 */

export interface DesktopPaths {
  portableRoot: string;
  coreRoot: string;
  userDataRoot: string;
  isPackaged: boolean;
}

export type UserDirName = 'layouts' | 'samples' | 'modules' | 'projects' | 'themes' | 'presets';

export interface ProjectFile {
  path: string;
  name: string;
  code: string;
}

export type MenuAction =
  | 'new-project'
  | 'open-project'
  | 'save-project'
  | 'save-as-project'
  | 'export-wav'
  | 'copy-strudel-link'
  | 'export-file'
  | 'git-commit'
  | 'git-push';

export interface DualDesktop {
  getPaths(): Promise<DesktopPaths>;
  /** File names (not paths) directly under userdata/<subdir>. */
  listUserDir(subdir: UserDirName): Promise<string[]>;

  openProjectDialog(): Promise<ProjectFile | null>;
  saveProjectDialog(code: string): Promise<{ path: string; name: string } | null>;
  writeFile(path: string, code: string): Promise<void>;
  getLastProject(): Promise<ProjectFile | null>;
  setLastProject(path: string | null): Promise<void>;
  setDirty(dirty: boolean): Promise<void>;
  confirmSaved(saved: boolean): Promise<void>;
  /** Stages + commits userdata/projects with the given message. `committed` is
   *  false both when there was nothing to commit (not an error) and on a real
   *  git failure — check `error` to tell the two apart. */
  gitCommit(message: string): Promise<{ committed: boolean; output: string; error?: boolean }>;
  /** Pushes userdata/projects to its remote. `pushed` is false with an
   *  explanatory message when no remote is configured, or `error: true` on a
   *  real git failure. */
  gitPush(): Promise<{ pushed: boolean; message: string; error?: boolean }>;
  /** Subscribes to a `menu:<action>` IPC channel; returns an unsubscribe function. */
  onMenuAction(action: MenuAction, callback: () => void): () => void;
}

declare global {
  interface Window {
    dualDesktop?: DualDesktop;
  }
}
