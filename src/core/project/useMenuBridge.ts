import { useEffect } from 'react';
import { audioExporter } from '@core/engine/impl/AudioExporterImpl';
import { eventBus } from '@core/events/EventBusImpl';
import { getStrudelShareLink } from '@core/project/shareLink';
import { useStore } from '@core/state/store';
import { getLastSyncedCode, projectManager } from './impl/ProjectManagerImpl';

/**
 * Bridges native File menu actions (New/Open/Save/Save As) to ProjectManager,
 * and marks the project dirty on any code:changed that isn't just the echo
 * of a New/Open/Save/boot-load. No-op outside Electron (window.dualDesktop
 * absent in plain-browser mode).
 */
export function useMenuBridge(): void {
  useEffect(() => {
    const unsubscribeDirtyTracking = eventBus.on('code:changed', ({ code, origin }) => {
      if (origin !== 'user_edit' && code === getLastSyncedCode()) return;
      useStore.getState().setDirty(true);
      void window.dualDesktop?.setDirty(true);
    });

    const desktop = window.dualDesktop;
    if (!desktop) return unsubscribeDirtyTracking;

    async function handleMenuSave(): Promise<void> {
      await projectManager.save();
      // Always ack, even on a cancelled Save As: main no-ops unless a window
      // close is waiting on this save (see electron/main.ts `closeRequested`),
      // but it must still clear that flag on cancel or the window can never close.
      await desktop!.confirmSaved(!!useStore.getState().currentProjectPath);
    }

    function handleMenuExportWav(): void {
      const input = window.prompt('Number of cycles to export', '4');
      if (input === null) return; // user cancelled

      const cycles = Number(input);
      if (!Number.isFinite(cycles) || cycles <= 0) return;

      void audioExporter.exportWav(cycles, useStore.getState().projectName);
    }

    async function handleMenuCopyStrudelLink(): Promise<void> {
      const link = getStrudelShareLink(useStore.getState().activeCode);
      try {
        await navigator.clipboard.writeText(link);
        useStore.getState().addNotification('strudel.cc link copied to clipboard', 'success');
      } catch (error) {
        useStore.getState().addNotification(`Failed to copy link: ${String(error)}`, 'error');
      }
    }

    async function handleMenuExportFile(): Promise<void> {
      // Deliberately bypasses ProjectManager.saveAs(): this is a one-off export
      // to another location, not a change of the current project's working file.
      const result = await desktop!.saveProjectDialog(useStore.getState().activeCode);
      if (!result) return;
      useStore.getState().addNotification(`Exported to "${result.name}"`, 'success');
    }

    async function handleMenuGitCommit(): Promise<void> {
      const defaultMessage = `Save project: ${useStore.getState().projectName} (${new Date().toISOString().slice(0, 10)})`;
      const message = window.prompt('Commit message', defaultMessage);
      if (message === null) return; // user cancelled

      const result = await desktop!.gitCommit(message);
      if (result.committed) {
        useStore.getState().addNotification('Project committed', 'success');
      } else if (result.error) {
        useStore.getState().addNotification(result.output, 'error');
      } else {
        useStore.getState().addNotification(result.output || 'Nothing to commit', 'info');
      }
    }

    async function handleMenuGitPush(): Promise<void> {
      const result = await desktop!.gitPush();
      if (result.pushed) {
        useStore.getState().addNotification('Project pushed to remote', 'success');
      } else {
        useStore.getState().addNotification(result.message, result.error ? 'error' : 'warning');
      }
    }

    const unsubscribeMenuActions = [
      desktop.onMenuAction('new-project', () => void projectManager.newProject()),
      desktop.onMenuAction('open-project', () => void projectManager.openProject()),
      desktop.onMenuAction('save-project', () => void handleMenuSave()),
      desktop.onMenuAction('save-as-project', () => void projectManager.saveAs()),
      desktop.onMenuAction('export-wav', handleMenuExportWav),
      desktop.onMenuAction('copy-strudel-link', () => void handleMenuCopyStrudelLink()),
      desktop.onMenuAction('export-file', () => void handleMenuExportFile()),
      desktop.onMenuAction('git-commit', () => void handleMenuGitCommit()),
      desktop.onMenuAction('git-push', () => void handleMenuGitPush()),
    ];

    return () => {
      unsubscribeDirtyTracking();
      unsubscribeMenuActions.forEach((unsubscribe) => unsubscribe());
    };
  }, []);
}
