import { useMemo, useState } from 'react';
import { useStore } from '@core/state/store';
import { panelRegistry } from '../registry/PanelRegistryImpl';
import { createPanelApi } from '../api/PanelApiImpl';
import { PanelIcon } from './PanelIcon';
import styles from './PanelContainer.module.css';

interface PanelContainerProps {
  layoutId: string;
  slotKey: string;
  defaultPanelId: string;
}

export function PanelContainer({ layoutId, slotKey, defaultPanelId }: PanelContainerProps) {
  const [open, setOpen] = useState(false);
  const overrideKey = `${layoutId}:${slotKey}`;
  const overridePanelId = useStore((s) => s.layoutPanelOverrides[overrideKey]);
  const panelId = overridePanelId ?? defaultPanelId;

  const panel = panelRegistry.get(panelId);
  const api = useMemo(() => createPanelApi(panelId), [panelId]);

  const choose = (chosenId: string) => {
    useStore.getState().setLayoutPanelOverride(overrideKey, chosenId);
    setOpen(false);
  };

  const reset = () => {
    useStore.getState().clearLayoutPanelOverride(overrideKey);
    setOpen(false);
  };

  const Panel = panel?.component;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.icon}>{panel?.icon && <PanelIcon name={panel.icon} />}</span>
        <span className={styles.name}>{panel?.name ?? panelId}</span>
        <div className={styles.switcher}>
          <button className={styles.switcherTrigger} onClick={() => setOpen((o) => !o)}>
            ▾
          </button>
          {open && (
            <div className={styles.switcherPanel}>
              {overridePanelId && overridePanelId !== defaultPanelId && (
                <button className={styles.switcherReset} onClick={reset}>
                  ↺ Réinitialiser
                </button>
              )}
              {panelRegistry.getAll().map((p) => (
                <button
                  key={p.id}
                  className={styles.switcherItem}
                  onClick={() => choose(p.id)}
                >
                  <PanelIcon name={p.icon ?? ''} />
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className={styles.content}>
        {Panel ? (
          <Panel api={api} />
        ) : (
          <div className={styles.empty}>
            <span>{panelId}</span>
          </div>
        )}
      </div>
    </div>
  );
}
