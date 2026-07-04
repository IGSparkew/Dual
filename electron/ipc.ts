import { app, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getCoreRoot, getPortableRoot, getUserDataRoot } from './paths';
import { USER_DIRS, type UserDir } from './userdata';

export function registerIpcHandlers(): void {
  ipcMain.handle('dual:paths', () => ({
    portableRoot: getPortableRoot(),
    coreRoot: getCoreRoot(),
    userDataRoot: getUserDataRoot(),
    isPackaged: app.isPackaged,
  }));

  // File names (not paths) directly under userdata/<subdir>.
  ipcMain.handle('dual:list-user-dir', async (_event, subdir: unknown) => {
    if (!USER_DIRS.includes(subdir as UserDir)) {
      throw new Error(`Unknown userdata dir: ${String(subdir)}`);
    }
    const dir = path.join(getUserDataRoot(), subdir as UserDir);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  });
}
