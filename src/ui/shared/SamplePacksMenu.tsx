import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@core/state/store';
import { sampleLoader } from '@core/engine/impl/SampleLoaderImpl';
import type { PackProgress, PackState } from '@core/types/desktop';
import styles from './SamplePacksMenu.module.css';

function formatSize(bytes: number): string {
  const mb = bytes / 1_000_000;
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} Go` : `${Math.round(mb)} Mo`;
}

function formatProgress(p: PackProgress): string {
  if (p.phase === 'downloading' && p.totalBytes > 0) {
    return `Téléchargement ${Math.round((p.receivedBytes / p.totalBytes) * 100)}%`;
  }
  if (p.phase === 'verifying') return 'Vérification…';
  if (p.phase === 'extracting') return 'Extraction…';
  return '…';
}

/**
 * Discreet header entry to install optional (tier-2, remote) sample packs on
 * demand — Electron-only (feature-detected via window.dualDesktop), fully
 * absent in the plain-browser build. Minimal by design: a dedicated Browser
 * panel (Phase 6) will eventually absorb this.
 */
export function SamplePacksMenu() {
  const desktop = window.dualDesktop;
  const [open, setOpen] = useState(false);
  const [packs, setPacks] = useState<PackState[]>([]);
  // Packs currently being installed by THIS component instance, and the
  // latest progress event received for each — installPack()'s own promise
  // already tells us when an install ends, so this only needs to track what
  // to render meanwhile (getPackStates() isn't re-polled mid-download).
  const [progressByPack, setProgressByPack] = useState<Record<string, PackProgress>>({});

  const refresh = useCallback(async () => {
    if (!desktop) return;
    setPacks(await desktop.getPackStates());
  }, [desktop]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!desktop) return;
    return desktop.onPackProgress((p) => {
      setProgressByPack((prev) => ({ ...prev, [p.packId]: p }));
    });
  }, [desktop]);

  const install = useCallback(
    async (packId: string) => {
      try {
        await desktop!.installPack(packId);
        await sampleLoader.loadInstalledPack(packId);
      } catch (error) {
        useStore.getState().addNotification(`Échec de l'installation de "${packId}": ${String(error)}`, 'error');
      } finally {
        setProgressByPack((prev) => {
          const { [packId]: _removed, ...rest } = prev;
          return rest;
        });
        await refresh();
      }
    },
    [desktop, refresh],
  );

  if (!desktop) return null;

  // Also show packs already 'installing' (e.g. an install started before this
  // component mounted, or survived a window reload) even before the first
  // progress event for them arrives — otherwise they'd be invisible until then.
  const availablePacks = packs.filter(
    (p) => p.status === 'available' || p.status === 'installing' || progressByPack[p.id],
  );

  return (
    <div className={styles.container}>
      <button className={styles.trigger} onClick={() => setOpen((o) => !o)}>
        Sample Packs
      </button>
      {open && (
        <div className={styles.panel}>
          {availablePacks.length === 0 && <p className={styles.empty}>Tous les packs sont installés</p>}
          {availablePacks.map((pack) => {
            const progress = progressByPack[pack.id];
            return (
              <div key={pack.id} className={styles.row}>
                <span className={styles.id}>{pack.id}</span>
                <span className={styles.size}>{formatSize(pack.sizeBytes)}</span>
                {progress ? (
                  <span className={styles.progress}>{formatProgress(progress)}</span>
                ) : pack.status === 'installing' ? (
                  <span className={styles.progress}>Installation en cours…</span>
                ) : (
                  <button className={styles.installBtn} onClick={() => void install(pack.id)}>
                    Installer
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
