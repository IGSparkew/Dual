import { useEffect } from 'react';
import styles from './App.module.css';
import { StrudelBridgeImpl } from '@core/engine/impl/StrudelBridgeImpl';

export function App() {

  const struddleBridge = new StrudelBridgeImpl();

  useEffect(() => {struddleBridge.init();}, []);

 const handleSong = () => {
  struddleBridge.evaluate("c3 e3 [g3 g3] c4");

 }


  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.logo}>Struddle DAW</span>
      </header>
      <main className={styles.workspace}>
        <p className={styles.placeholder}>Phase 1 — en cours d&apos;initialisation</p>
        <button onClick={handleSong} style={{ padding: 20, fontSize: 24 }}>
         🔊 Test son
        </button>
      </main>
    </div>
  );
}
