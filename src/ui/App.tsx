import { useEffect, useState } from 'react';
import styles from './App.module.css';
import { strudelBridge } from '@core/engine/impl/StrudelBridgeImpl';
import { useStore } from '@core/state/store';
import { LayoutManager } from '@layout/LayoutManager';
import type { LayoutId } from '@layout/LayoutManager';
import { Notifications } from './shared/Notifications';

// Register all built-in panels
import '@panels/transport/index';
import '@panels/editor/index';
import '@panels/session/index';
import '@panels/visualizer/index';
import '@panels/mixer/index';
import '@panels/effects/index';

const LAYOUTS: { id: LayoutId; label: string }[] = [
  { id: 'production', label: 'Production' },
  { id: 'live-coding', label: 'Live Coding' },
  { id: 'mixing', label: 'Mixing' },
  { id: 'minimal', label: 'Minimal' },
];

export function App() {
  const engineStatus = useStore((s) => s.engineStatus);
  const [layoutId, setLayoutId] = useState<LayoutId>('production');

  useEffect(() => {
    strudelBridge.init();
  }, []);

  if (engineStatus !== 'ready') {
    return (
      <div className={styles.loading}>
        <h1>Production Studio</h1>
        {engineStatus === 'init' && <p>Click anywhere to start</p>}
        {engineStatus === 'loading' && <p>Initializing audio…</p>}
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.logo}>Struddle DAW</span>
        <div className={styles.layoutSwitcher}>
          {LAYOUTS.map(({ id, label }) => (
            <button
              key={id}
              className={`${styles.layoutBtn} ${layoutId === id ? styles.layoutBtnActive : ''}`}
              onClick={() => setLayoutId(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <main className={styles.workspace}>
        <LayoutManager layoutId={layoutId} />
      </main>
      <Notifications />
    </div>
  );
}
