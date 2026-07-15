/**
 * Tests for `ProjectManagerImpl` (New/Open/Save/Save As + boot-load flow).
 *
 * `syncController` is mocked (its own evaluation pipeline pulls in the
 * `@strudel/core` barrel, which breaks under vitest — see `shareLink.test.ts`
 * for the same gotcha) so only `ProjectManagerImpl`'s own orchestration is
 * under test: dirty-confirmation gating, save-vs-save-as branching, and the
 * `window.dualDesktop` bridge calls. The real Zustand `useStore` is used
 * (a plain, dependency-free store) and reset before each test rather than
 * mocked, since asserting on its resulting state is more faithful than
 * asserting on setter call arguments.
 *
 * `window` does not exist in vitest's default `node` test environment (no
 * jsdom configured for this project — see `vitest.config.ts`), so
 * `vi.stubGlobal('window', ...)` provides the minimal `confirm`/`dualDesktop`
 * surface `ProjectManagerImpl` touches.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn() }));
vi.mock('@core/interpreter/impl/SyncControllerImpl', () => ({
  syncController: { notify: notifyMock, isLocked: vi.fn(() => false), dispose: vi.fn() },
}));

import { useStore } from '@core/state/store';
import { ProjectManagerImpl, getLastSyncedCode } from './ProjectManagerImpl';
import type { DualDesktop, ProjectFile } from '@core/types/desktop';

function makeDesktop(overrides: Partial<DualDesktop> = {}): DualDesktop {
  return {
    getPaths: vi.fn(),
    listUserDir: vi.fn(),
    openProjectDialog: vi.fn(),
    saveProjectDialog: vi.fn(),
    writeFile: vi.fn(),
    getLastProject: vi.fn(),
    setLastProject: vi.fn(),
    setDirty: vi.fn(),
    confirmSaved: vi.fn(),
    gitCommit: vi.fn(),
    gitPush: vi.fn(),
    onMenuAction: vi.fn(),
    ...overrides,
  } as DualDesktop;
}

const INITIAL_STATE = useStore.getState();

describe('ProjectManagerImpl', () => {
  let manager: ProjectManagerImpl;
  let confirmMock: ReturnType<typeof vi.fn>;
  let desktop: DualDesktop;

  beforeEach(() => {
    manager = new ProjectManagerImpl();
    notifyMock.mockClear();
    useStore.setState(
      {
        ...INITIAL_STATE,
        isDirty: false,
        currentProjectPath: null,
        projectName: 'Untitled',
        activeCode: '',
        notifications: [],
      },
      true,
    );
    confirmMock = vi.fn(() => true);
    desktop = makeDesktop();
    vi.stubGlobal('window', { confirm: confirmMock, dualDesktop: desktop });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('newProject', () => {
    it('does nothing when the project is dirty and the user cancels the confirm dialog', async () => {
      useStore.setState({ isDirty: true, currentProjectPath: '/old.strudel', projectName: 'Old' });
      confirmMock.mockReturnValue(false);

      await manager.newProject();

      expect(notifyMock).not.toHaveBeenCalled();
      expect(useStore.getState().isDirty).toBe(true);
      expect(useStore.getState().currentProjectPath).toBe('/old.strudel');
      expect(useStore.getState().projectName).toBe('Old');
    });

    it('resets to an untitled empty project when not dirty (no confirm needed)', async () => {
      useStore.setState({ isDirty: false, currentProjectPath: '/old.strudel', projectName: 'Old' });

      await manager.newProject();

      expect(confirmMock).not.toHaveBeenCalled();
      expect(notifyMock).toHaveBeenCalledWith('ui_action', expect.any(String));
      expect(useStore.getState().currentProjectPath).toBeNull();
      expect(useStore.getState().projectName).toBe('Untitled');
      expect(useStore.getState().isDirty).toBe(false);
      // Otherwise the next boot would reload the project New Project just discarded.
      expect(desktop.setLastProject).toHaveBeenCalledWith(null);
    });

    it('proceeds when dirty but the user confirms discarding changes', async () => {
      useStore.setState({ isDirty: true });
      confirmMock.mockReturnValue(true);

      await manager.newProject();

      expect(notifyMock).toHaveBeenCalledTimes(1);
      expect(useStore.getState().currentProjectPath).toBeNull();
    });
  });

  describe('save', () => {
    it('writes to the existing path without prompting when currentProjectPath is set', async () => {
      useStore.setState({ currentProjectPath: '/song.strudel', activeCode: 's("bd")' });

      await expect(manager.save()).resolves.toBe(true);

      expect(desktop.writeFile).toHaveBeenCalledWith('/song.strudel', 's("bd")');
      expect(desktop.saveProjectDialog).not.toHaveBeenCalled();
      expect(useStore.getState().isDirty).toBe(false);
      expect(getLastSyncedCode()).toBe('s("bd")');
    });

    it('delegates to the save-as dialog flow when there is no current path', async () => {
      useStore.setState({ currentProjectPath: null, activeCode: 's("bd")' });
      (desktop.saveProjectDialog as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await manager.save();

      expect(desktop.saveProjectDialog).toHaveBeenCalledWith('s("bd")');
      expect(desktop.writeFile).not.toHaveBeenCalled();
    });

    it('surfaces a write failure as an error notification instead of throwing', async () => {
      useStore.setState({ currentProjectPath: '/song.strudel', activeCode: 's("bd")' });
      (desktop.writeFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('disk full'));

      // Must resolve false (not just avoid throwing): callers such as the window
      // close flow use this to decide whether it's safe to destroy the window.
      await expect(manager.save()).resolves.toBe(false);

      const notifications = useStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('error');
      expect(notifications[0].message).toMatch(/disk full/);
    });

    it('is a no-op when there is no desktop bridge (plain browser, no Electron)', async () => {
      vi.stubGlobal('window', { confirm: confirmMock, dualDesktop: undefined });
      useStore.setState({ currentProjectPath: '/song.strudel', activeCode: 's("bd")' });

      await expect(manager.save()).resolves.toBe(false);
      expect(desktop.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('saveAs', () => {
    it('cancels cleanly when the dialog is dismissed (no path set, no notification)', async () => {
      (desktop.saveProjectDialog as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      useStore.setState({ activeCode: 's("bd")' });

      await expect(manager.saveAs()).resolves.toBe(false);

      expect(useStore.getState().currentProjectPath).toBeNull();
      expect(useStore.getState().notifications).toHaveLength(0);
    });

    it('sets the new path/name, remembers it as the last project, and clears dirty', async () => {
      (desktop.saveProjectDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
        path: '/new/song.strudel',
        name: 'song',
      });
      useStore.setState({ activeCode: 's("bd")', isDirty: true });

      await expect(manager.saveAs()).resolves.toBe(true);

      expect(useStore.getState().currentProjectPath).toBe('/new/song.strudel');
      expect(useStore.getState().projectName).toBe('song');
      expect(useStore.getState().isDirty).toBe(false);
      expect(desktop.setLastProject).toHaveBeenCalledWith('/new/song.strudel');
      expect(getLastSyncedCode()).toBe('s("bd")');
    });
  });

  describe('openProject', () => {
    it('does nothing when dirty and the user cancels', async () => {
      useStore.setState({ isDirty: true });
      confirmMock.mockReturnValue(false);

      await manager.openProject();

      expect(desktop.openProjectDialog).not.toHaveBeenCalled();
    });

    it('loads the chosen project and re-evaluates it via syncController', async () => {
      const project: ProjectFile = { path: '/p.strudel', name: 'P', code: 's("hh*8")' };
      (desktop.openProjectDialog as ReturnType<typeof vi.fn>).mockResolvedValue(project);

      await manager.openProject();

      expect(notifyMock).toHaveBeenCalledWith('ui_action', 's("hh*8")');
      expect(useStore.getState().currentProjectPath).toBe('/p.strudel');
      expect(useStore.getState().projectName).toBe('P');
      expect(desktop.setLastProject).toHaveBeenCalledWith('/p.strudel');
    });

    it('cancels cleanly when the open dialog returns null', async () => {
      (desktop.openProjectDialog as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await manager.openProject();

      expect(notifyMock).not.toHaveBeenCalled();
      expect(useStore.getState().currentProjectPath).toBeNull();
    });
  });

  describe('initBlankProject', () => {
    it('resets to an untitled empty project without touching the remembered last project', () => {
      useStore.setState({ isDirty: true, currentProjectPath: '/old.strudel', projectName: 'Old' });

      manager.initBlankProject();

      expect(notifyMock).toHaveBeenCalledWith('ui_action', expect.any(String));
      expect(useStore.getState().isDirty).toBe(false);
      expect(desktop.setLastProject).not.toHaveBeenCalled();
    });
  });

  describe('openLastProject', () => {
    it('does nothing when dirty and the user cancels', async () => {
      useStore.setState({ isDirty: true });
      confirmMock.mockReturnValue(false);

      await manager.openLastProject();

      expect(desktop.getLastProject).not.toHaveBeenCalled();
    });

    it('notifies when there is no remembered last project', async () => {
      (desktop.getLastProject as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await manager.openLastProject();

      expect(notifyMock).not.toHaveBeenCalled();
      expect(useStore.getState().notifications).toHaveLength(1);
      expect(useStore.getState().notifications[0].type).toBe('info');
    });

    it('applies the remembered project and notifies success', async () => {
      const project: ProjectFile = { path: '/last.strudel', name: 'Last', code: 's("bd")' };
      (desktop.getLastProject as ReturnType<typeof vi.fn>).mockResolvedValue(project);

      await manager.openLastProject();

      expect(notifyMock).toHaveBeenCalledWith('ui_action', 's("bd")');
      expect(useStore.getState().currentProjectPath).toBe('/last.strudel');
      expect(useStore.getState().notifications).toHaveLength(1);
      expect(useStore.getState().notifications[0].type).toBe('success');
    });
  });
});
