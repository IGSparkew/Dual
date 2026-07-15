import { useEffect } from 'react';
import { audioExporter } from '@core/engine/impl/AudioExporterImpl';
import { eventBus } from '@core/events/EventBusImpl';
import { getStrudelShareLink } from '@core/project/shareLink';
import { useStore } from '@core/state/store';
import { getLastSyncedCode, projectManager } from './impl/ProjectManagerImpl';
import { requestPrompt } from '@ui/shared/prompt-dialog';

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
      const saved = await projectManager.save();
      // Always ack, even on a cancelled/failed save: main no-ops unless a window
      // close is waiting on this save (see electron/main.ts `closeRequested`), but
      // it must still clear that flag on failure or the window can never close —
      // and it must NOT destroy the window unless the write actually succeeded,
      // or a failed save (disk full, locked file…) would silently lose changes.
      await desktop!.confirmSaved(saved);
    }

    async function handleMenuExportWav(): Promise<void> {
      const input = await requestPrompt('Number of cycles to export', '4');
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

    // Git targets the directory of the currently open project file — commit/push
    // are meaningless before the project has a location on disk, so both bail
    // out with a notification asking for a save first rather than falling back
    // to some other implicit folder.
    function requireProjectPath(): string | null {
      const projectPath = useStore.getState().currentProjectPath;
      if (!projectPath) {
        useStore.getState().addNotification('Save the project before using Git', 'warning');
      }
      return projectPath;
    }

    async function handleMenuGitCommit(): Promise<void> {
      const projectPath = requireProjectPath();
      if (!projectPath) return;

      const defaultMessage = `Save project: ${useStore.getState().projectName} (${new Date().toISOString().slice(0, 10)})`;
      const message = await requestPrompt('Commit message', defaultMessage);
      if (message === null) return; // user cancelled

      const result = await desktop!.gitCommit(projectPath, message);
      if (result.committed) {
        useStore.getState().addNotification('Project committed', 'success');
      } else if (result.error) {
        useStore.getState().addNotification(result.output, 'error');
      } else {
        useStore.getState().addNotification(result.output || 'Nothing to commit', 'info');
      }
    }

    async function handleMenuGitSetRemote(): Promise<void> {
      const projectPath = requireProjectPath();
      if (!projectPath) return;

      const url = await requestPrompt('Git remote URL (origin)', '');
      if (url === null || url.trim() === '') return; // user cancelled

      const result = await desktop!.gitSetRemote(projectPath, url.trim());
      if (result.ok) {
        useStore.getState().addNotification('Git remote updated', 'success');
      } else {
        useStore.getState().addNotification(result.message ?? 'Failed to set remote', 'error');
      }
    }

    async function handleMenuGitPush(): Promise<void> {
      const projectPath = requireProjectPath();
      if (!projectPath) return;

      const result = await desktop!.gitPush(projectPath);
      if (result.pushed) {
        useStore.getState().addNotification('Project pushed to remote', 'success');
      } else {
        useStore.getState().addNotification(result.message, result.error ? 'error' : 'warning');
      }
    }

    const unsubscribeMenuActions = [
      desktop.onMenuAction('new-project', () => void projectManager.newProject()),
      desktop.onMenuAction('open-project', () => void projectManager.openProject()),
      desktop.onMenuAction('open-last-project', () => void projectManager.openLastProject()),
      desktop.onMenuAction('save-project', () => void handleMenuSave()),
      desktop.onMenuAction('save-as-project', () => void projectManager.saveAs()),
      desktop.onMenuAction('export-wav', () => void handleMenuExportWav()),
      desktop.onMenuAction('copy-strudel-link', () => void handleMenuCopyStrudelLink()),
      desktop.onMenuAction('git-commit', () => void handleMenuGitCommit()),
      desktop.onMenuAction('git-set-remote', () => void handleMenuGitSetRemote()),
      desktop.onMenuAction('git-push', () => void handleMenuGitPush()),
    ];

    return () => {
      unsubscribeDirtyTracking();
      unsubscribeMenuActions.forEach((unsubscribe) => unsubscribe());
    };
  }, []);
}
