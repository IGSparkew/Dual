import styles from './App.module.css';
import { StrudelBridgeImpl } from '@core/engine/impl/StrudelBridgeImpl';

export function App() {

    const struddleBridge = new StrudelBridgeImpl();
   const handlePlay = async () => {
      await struddleBridge.init();
      await struddleBridge.evaluate('s("bd sd [hh hh] cp")');
      const haps = struddleBridge.queryArc(0, 1);
      haps.forEach((hap, i) => {
        console.log(`Hap ${i}:`, hap.value, 
          'begin:', hap.whole.begin.valueOf(),
          'end:', hap.whole.end.valueOf()
        );
      });

    struddleBridge.getScheduler().start();
   }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.logo}>Struddle DAW</span>
      </header>
      <main className={styles.workspace}>
        <p className={styles.placeholder}>Phase 1 — en cours d&apos;initialisation</p>
          <button onClick={handlePlay}>▶ Play</button>
          <button onClick={() => struddleBridge.dispose()}>⏹ Stop</button>
      </main>
    </div>
  );
}
