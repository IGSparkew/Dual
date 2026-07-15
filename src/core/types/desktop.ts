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
  | 'open-last-project'
  | 'save-project'
  | 'save-as-project'
  | 'export-wav'
  | 'copy-strudel-link'
  | 'git-commit'
  | 'git-push'
  | 'git-set-remote';

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
  /** Stages + commits the repo rooted at the directory containing `projectPath`
   *  (initialized on first use) with the given message. `committed` is false
   *  both when there was nothing to commit (not an error) and on a real git
   *  failure — check `error` to tell the two apart. */
  gitCommit(
    projectPath: string,
    message: string,
  ): Promise<{ committed: boolean; output: string; error?: boolean }>;
  /** Pushes the repo rooted at the directory containing `projectPath` to its
   *  remote. `pushed` is false with an explanatory message when no remote is
   *  configured, or `error: true` on a real git failure. */
  gitPush(projectPath: string): Promise<{ pushed: boolean; message: string; error?: boolean }>;
  /** Points the repo rooted at the directory containing `projectPath` at `url`
   *  (adds `origin` if missing, otherwise updates its URL). */
  gitSetRemote(projectPath: string, url: string): Promise<{ ok: boolean; message?: string }>;
  /** Subscribes to a `menu:<action>` IPC channel; returns an unsubscribe function. */
  onMenuAction(action: MenuAction, callback: () => void): () => void;
}

declare global {
  interface Window {
    dualDesktop?: DualDesktop;
  }
}
