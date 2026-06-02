import { useEffect } from 'react';
import styles from './App.module.css';
import { strudelBridge } from '@core/engine/impl/StrudelBridgeImpl';
import { useStore } from '@core/state/store';

export function App() {
const engineStatus = useStore((s) => s.engineStatus);

  useEffect(() => {
    strudelBridge.init();
  }, []);


  if (engineStatus !== 'ready' ) {
    return (
      <div className={styles.loading}>
        <h1>Production Studio</h1>
        {engineStatus === "init" && <p>Click anywhere to start</p>}
        {engineStatus === 'loading' && <p>Initializing audio...</p>}
      </div>
    );

  }
  
   const handlePlay = async () => {
      await strudelBridge.evaluate('s("bd sd [hh hh] cp")');
      const haps = strudelBridge.queryArc(0, 1);
      haps.forEach((hap, i) => {
        console.log(`Hap ${i}:`, hap.value, 
          'begin:', hap.whole.begin.valueOf(),
          'end:', hap.whole.end.valueOf()
        );
      });

    strudelBridge.getScheduler().start();
   }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.logo}>Struddle DAW</span>
      </header>
      <main className={styles.workspace}>
        <p className={styles.placeholder}>Phase 1 — en cours d&apos;initialisation</p>
          <button onClick={handlePlay}>▶ Play</button>
          <button onClick={() => strudelBridge.getScheduler().stop()}>⏹ Stop</button>
      </main>
    </div>
  );
}
