import { syncController } from '@core/interpreter/impl/SyncControllerImpl';
import { useStore } from '@core/state/store';
import type { ProjectManager } from '../ProjectManager';

// Minimal starting code for an empty project — the same silence token
// `session.ts` (projectDollar) emits when no clip is playing, so the
// document stays evaluable instead of empty.
const EMPTY_PROJECT_CODE = '$: "~"';

// Snapshot of the code last applied by a New/Open/Save/boot-load, used by
// useMenuBridge to tell a genuine edit apart from the code:changed event that
// syncController fires right after applying that same code (ui_action).
let lastSyncedCode = '';

export function getLastSyncedCode(): string {
  return lastSyncedCode;
}

export class ProjectManagerImpl implements ProjectManager {
  async newProject(): Promise<void> {
    const store = useStore.getState();
    if (store.isDirty && !window.confirm('Discard unsaved changes and start a new project?')) {
      return;
    }

    syncController.notify('ui_action', EMPTY_PROJECT_CODE);
    store.setCurrentProjectPath(null);
    store.setProjectName('Untitled');
    this._markSynced(EMPTY_PROJECT_CODE);
    // Otherwise the next boot reloads the project New Project just discarded.
    await window.dualDesktop?.setLastProject(null);
  }

  async openProject(): Promise<void> {
    const desktop = window.dualDesktop;
    if (!desktop) return;

    const store = useStore.getState();
    if (store.isDirty && !window.confirm('Discard unsaved changes and open another project?')) {
      return;
    }

    const project = await desktop.openProjectDialog();
    if (!project) return;

    syncController.notify('ui_action', project.code);
    store.setCurrentProjectPath(project.path);
    store.setProjectName(project.name);
    this._markSynced(project.code);
    await desktop.setLastProject(project.path);
    store.addNotification(`Opened "${project.name}"`, 'success');
  }

  async save(): Promise<boolean> {
    const desktop = window.dualDesktop;
    if (!desktop) return false;

    const path = useStore.getState().currentProjectPath;
    if (!path) {
      return this.saveAs();
    }

    const code = useStore.getState().activeCode;
    try {
      await desktop.writeFile(path, code);
      this._markSynced(code);
      useStore.getState().addNotification('Project saved', 'success');
      return true;
    } catch (error) {
      useStore.getState().addNotification(`Failed to save project: ${String(error)}`, 'error');
      return false;
    }
  }

  async saveAs(): Promise<boolean> {
    const desktop = window.dualDesktop;
    if (!desktop) return false;

    const code = useStore.getState().activeCode;
    try {
      const result = await desktop.saveProjectDialog(code);
      if (!result) return false; // user cancelled the dialog

      const store = useStore.getState();
      store.setCurrentProjectPath(result.path);
      store.setProjectName(result.name);
      this._markSynced(code);
      await desktop.setLastProject(result.path);
      store.addNotification(`Saved as "${result.name}"`, 'success');
      return true;
    } catch (error) {
      useStore.getState().addNotification(`Failed to save project: ${String(error)}`, 'error');
      return false;
    }
  }

  async loadLastProjectOnBoot(): Promise<void> {
    const desktop = window.dualDesktop;
    if (!desktop) return;

    const project = await desktop.getLastProject();
    if (!project) return;

    syncController.notify('ui_action', project.code);
    const store = useStore.getState();
    store.setCurrentProjectPath(project.path);
    store.setProjectName(project.name);
    this._markSynced(project.code);
  }

  private _markSynced(code: string): void {
    lastSyncedCode = code;
    useStore.getState().setDirty(false);
    void window.dualDesktop?.setDirty(false);
  }
}

export const projectManager: ProjectManager = new ProjectManagerImpl();
