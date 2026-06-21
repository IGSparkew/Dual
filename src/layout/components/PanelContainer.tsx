import { useRef } from 'react';
import { panelRegistry } from '../registry/PanelRegistryImpl';
import { createPanelApi } from '../api/PanelApiImpl';
import type { PanelApi } from '../api/PanelApi';
import styles from './PanelContainer.module.css';

interface PanelContainerProps {
  panelId: string;
}

export function PanelContainer({ panelId }: PanelContainerProps) {
  const panel = panelRegistry.get(panelId);

  const apiRef = useRef<PanelApi | null>(null);
  if (!apiRef.current) {
    apiRef.current = createPanelApi(panelId);
  }

  if (!panel) {
    return (
      <div className={styles.empty}>
        <span>{panelId}</span>
      </div>
    );
  }

  const { component: Panel, name, icon } = panel;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.icon}>{icon}</span>
        <span className={styles.name}>{name}</span>
      </div>
      <div className={styles.content}>
        <Panel api={apiRef.current} />
      </div>
    </div>
  );
}
