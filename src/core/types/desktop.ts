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

export interface DualDesktop {
  getPaths(): Promise<DesktopPaths>;
  /** File names (not paths) directly under userdata/<subdir>. */
  listUserDir(subdir: UserDirName): Promise<string[]>;
}

declare global {
  interface Window {
    dualDesktop?: DualDesktop;
  }
}
