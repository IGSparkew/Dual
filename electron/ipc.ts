import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getCoreRoot, getPortableRoot, getUserDataRoot } from './paths';
import { USER_DIRS, type UserDir } from './userdata';
import { getLastProjectPath, setLastProjectPath } from './appState';
import { findRepoRoot, gitCommit, gitPull, gitPush, setRemote } from './git';
import { getPackStates, installPack, uninstallPack } from './packs';

interface ProjectFile {
  path: string;
  name: string;
  code: string;
}

// Renderer reports its own dirty state via `dual:set-dirty`; main reads it back
// on window close to decide whether to intercept the close.
let isDirty = false;

export function getDirtyState(): boolean {
  return isDirty;
}

function projectNameFromPath(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

// Parenting the open/save dialogs to the main window makes them modal: the
// window can't be closed (or a second dialog opened) while one is pending —
// closes the gap where a close-flow Save As left unattended.
export function registerIpcHandlers(win: BrowserWindow): void {
  ipcMain.handle('dual:paths', () => ({
    portableRoot: getPortableRoot(),
    coreRoot: getCoreRoot(),
    userDataRoot: getUserDataRoot(),
    isPackaged: app.isPackaged,
  }));

  ipcMain.handle('dual:get-pack-states', () => getPackStates());

  ipcMain.handle('dual:install-pack', async (_event, packId: unknown): Promise<void> => {
    if (typeof packId !== 'string') {
      throw new Error('dual:install-pack expects a string packId');
    }
    await installPack(packId, (progress) => {
      win.webContents.send('pack:progress', progress);
    });
  });

  ipcMain.handle('dual:uninstall-pack', async (_event, packId: unknown): Promise<void> => {
    if (typeof packId !== 'string') {
      throw new Error('dual:uninstall-pack expects a string packId');
    }
    await uninstallPack(packId);
  });

  // File names (not paths) directly under userdata/<subdir>.
  ipcMain.handle('dual:list-user-dir', async (_event, subdir: unknown) => {
    if (!USER_DIRS.includes(subdir as UserDir)) {
      throw new Error(`Unknown userdata dir: ${String(subdir)}`);
    }
    const dir = path.join(getUserDataRoot(), subdir as UserDir);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  });

  ipcMain.handle('dual:open-project-dialog', async (): Promise<ProjectFile | null> => {
    const result = await dialog.showOpenDialog(win, {
      defaultPath: path.join(getUserDataRoot(), 'projects'),
      filters: [{ name: 'Strudel Project', extensions: ['strudel'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    const code = await fs.readFile(filePath, 'utf-8');
    return { path: filePath, name: projectNameFromPath(filePath), code };
  });

  ipcMain.handle(
    'dual:save-project-dialog',
    async (_event, code: unknown): Promise<{ path: string; name: string } | null> => {
      if (typeof code !== 'string') {
        throw new Error('dual:save-project-dialog expects a string code');
      }

      const result = await dialog.showSaveDialog(win, {
        defaultPath: path.join(getUserDataRoot(), 'projects', 'untitled.strudel'),
        filters: [{ name: 'Strudel Project', extensions: ['strudel'] }],
      });
      if (result.canceled || !result.filePath) return null;

      await fs.writeFile(result.filePath, code, 'utf-8');
      return { path: result.filePath, name: projectNameFromPath(result.filePath) };
    },
  );

  ipcMain.handle('dual:write-file', async (_event, filePath: unknown, code: unknown): Promise<void> => {
    if (typeof filePath !== 'string' || typeof code !== 'string') {
      throw new Error('dual:write-file expects (path: string, code: string)');
    }
    await fs.writeFile(filePath, code, 'utf-8');
  });

  ipcMain.handle('dual:get-last-project', async (): Promise<ProjectFile | null> => {
    const lastPath = getLastProjectPath();
    if (!lastPath) return null;

    try {
      const code = await fs.readFile(lastPath, 'utf-8');
      return { path: lastPath, name: projectNameFromPath(lastPath), code };
    } catch {
      // File was moved/deleted since the last run — boot with no project instead of throwing.
      return null;
    }
  });

  // Re-reads a project file already known to the renderer (e.g. after a Git
  // Pull landed changes on disk outside the writeFile/syncController path) —
  // unlike open-project-dialog, this doesn't prompt, it just re-reads `path`.
  ipcMain.handle('dual:read-project-file', async (_event, filePath: unknown): Promise<ProjectFile | null> => {
    if (typeof filePath !== 'string') {
      throw new Error('dual:read-project-file expects a string path');
    }
    try {
      const code = await fs.readFile(filePath, 'utf-8');
      return { path: filePath, name: projectNameFromPath(filePath), code };
    } catch {
      return null;
    }
  });

  ipcMain.handle('dual:set-last-project', (_event, filePath: unknown) => {
    if (filePath !== null && typeof filePath !== 'string') {
      throw new Error('dual:set-last-project expects a string or null');
    }
    setLastProjectPath(filePath);
  });

  ipcMain.handle('dual:set-dirty', (_event, dirty: unknown) => {
    if (typeof dirty !== 'boolean') {
      throw new Error('dual:set-dirty expects a boolean');
    }
    isDirty = dirty;
  });

  // Commit/push failures (e.g. git not installed, no user.name/user.email
  // configured) are caught and returned as data rather than left to reject
  // the IPC call — the renderer surfaces them as a notification either way,
  // and this keeps handleMenuGit* free of try/catch on the caller side.
  //
  // The repo targeted is the directory containing the given project file
  // (not a single fixed folder) — each project defines its own commit target,
  // which also lets projects saved outside userdata/projects (via Save As) be
  // versioned in place.
  ipcMain.handle(
    'dual:git-commit',
    async (
      _event,
      projectPath: unknown,
      message: unknown,
    ): Promise<{ committed: boolean; output: string; error?: boolean }> => {
      if (typeof projectPath !== 'string' || typeof message !== 'string') {
        throw new Error('dual:git-commit expects (projectPath: string, message: string)');
      }
      const dir = path.dirname(projectPath);
      try {
        return await gitCommit(dir, message);
      } catch (error) {
        // Distinct from the "nothing to commit" case (which gitCommit resolves,
        // not throws) so the renderer can tell a real failure apart from a no-op.
        return { committed: false, output: String(error), error: true };
      }
    },
  );

  ipcMain.handle(
    'dual:git-push',
    async (
      _event,
      projectPath: unknown,
    ): Promise<{ pushed: boolean; message: string; error?: boolean }> => {
      if (typeof projectPath !== 'string') {
        throw new Error('dual:git-push expects a string projectPath');
      }
      const dir = path.dirname(projectPath);
      try {
        return await gitPush(dir);
      } catch (error) {
        return { pushed: false, message: String(error), error: true };
      }
    },
  );

  ipcMain.handle(
    'dual:git-find-repo-root',
    async (_event, projectPath: unknown): Promise<{ root: string | null }> => {
      if (typeof projectPath !== 'string') {
        throw new Error('dual:git-find-repo-root expects a string projectPath');
      }
      const dir = path.dirname(projectPath);
      return { root: await findRepoRoot(dir) };
    },
  );

  ipcMain.handle(
    'dual:git-pull',
    async (
      _event,
      projectPath: unknown,
    ): Promise<{ pulled: boolean; message: string; error?: boolean }> => {
      if (typeof projectPath !== 'string') {
        throw new Error('dual:git-pull expects a string projectPath');
      }
      const dir = path.dirname(projectPath);
      try {
        return await gitPull(dir);
      } catch (error) {
        return { pulled: false, message: String(error), error: true };
      }
    },
  );

  // Lets each project point `git push` at its own remote instead of whatever
  // origin (if any) happens to already be configured in that directory.
  ipcMain.handle(
    'dual:git-set-remote',
    async (
      _event,
      projectPath: unknown,
      url: unknown,
    ): Promise<{ ok: boolean; message?: string }> => {
      if (typeof projectPath !== 'string' || typeof url !== 'string') {
        throw new Error('dual:git-set-remote expects (projectPath: string, url: string)');
      }
      const dir = path.dirname(projectPath);
      try {
        await setRemote(dir, url);
        return { ok: true };
      } catch (error) {
        return { ok: false, message: String(error) };
      }
    },
  );
}
