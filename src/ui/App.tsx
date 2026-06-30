import { useEffect, useState } from 'react';
import styles from './App.module.css';
import { strudelBridge } from '@core/engine/impl/StrudelBridgeImpl';
import { useStore } from '@core/state/store';
import { LayoutManager } from '@layout/components/LayoutManager';
import { useLayoutRegistry } from '@layout/registry/LayoutRegistryImpl';
import { Notifications } from './shared/Notifications';

// Register all built-in modules
import '@modules/transport/index';
import '@modules/editor/index';
import '@modules/session/index';
import '@modules/visualizer/index';
import '@modules/mixer/index';
import '@modules/effects/index';

// Load layouts from /layouts/*.json
import '@layout/loaders/layout-loader';

export function App() {
  const engineStatus = useStore((s) => s.engineStatus);
  const layouts = useLayoutRegistry();
  const [activeLayoutId, setActiveLayoutId] = useState('production');

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
          {layouts.map(({ id, name, icon }) => (
            <button
              key={id}
              className={`${styles.layoutBtn} ${activeLayoutId === id ? styles.layoutBtnActive : ''}`}
              onClick={() => setActiveLayoutId(id)}
              title={name}
            >
              {icon && <span className={styles.layoutIcon}>{icon}</span>}
              {name}
            </button>
          ))}
        </div>
      </header>
      <main className={styles.workspace}>
        <LayoutManager layoutId={activeLayoutId} />
      </main>
      <Notifications />
    </div>
  );
}
