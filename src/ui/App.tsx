import { useEffect, useRef, useState } from 'react';
import styles from './App.module.css';
import { strudelBridge } from '@core/engine/impl/StrudelBridgeImpl';
import { scheduler } from '@core/engine/impl/SchedulerImpl';
import { sampleLoader } from '@core/engine/impl/SampleLoaderImpl';
import { useStore } from '@core/state/store';

const DEFAULT_CODE = 's("bd sd [hh hh] cp").gain(0.8)';

export function App() {
  const engineStatus = useStore((s) => s.engineStatus);
  const transport = useStore((s) => s.transport);
  const [code, setCode] = useState(DEFAULT_CODE);
  const [sampleLog, setSampleLog] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    strudelBridge.init();
  }, []);

  const handlePlay = async () => {
    await strudelBridge.evaluate(code);
    scheduler.play();
  };

  const handlePause = () => scheduler.pause();

  const handleStop = () => scheduler.stop();

  const handleBpm = (e: React.ChangeEvent<HTMLInputElement>) => {
    scheduler.setBpm(Number(e.target.value));
  };

  const handleFileLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSampleLog(`Chargement de ${file.name}…`);
    try {
      const name = await sampleLoader.registerFile(file);
      setCode(`s("${name}")`);
      setSampleLog(`✓ "${name}" enregistré — utilise s("${name}") dans le code`);
    } catch (err) {
      setSampleLog(`✗ Erreur : ${err}`);
    }
    e.target.value = '';
  };

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
      </header>
      <main className={styles.workspace}>
        <div className={styles.testPanel}>

          {/* Code */}
          <section className={styles.section}>
            <label className={styles.label}>Code Strudel</label>
            <textarea
              className={styles.codeInput}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              rows={3}
              spellCheck={false}
            />
          </section>

          {/* Transport */}
          <section className={styles.section}>
            <label className={styles.label}>Transport</label>
            <div className={styles.row}>
              <button className={styles.btn} onClick={handlePlay}>▶ Play</button>
              <button className={styles.btn} onClick={handlePause}>⏸ Pause</button>
              <button className={styles.btn} onClick={handleStop}>⏹ Stop</button>
            </div>
            <div className={styles.row}>
              <label className={styles.label}>BPM</label>
              <input
                type="range"
                min={40}
                max={240}
                defaultValue={120}
                onChange={handleBpm}
              />
              <span className={styles.value}>{transport.bpm}</span>
            </div>
            <div className={styles.statusRow}>
              <span className={styles.badge} data-status={transport.status}>{transport.status}</span>
              <span className={styles.value}>pos: {transport.position.toFixed(2)} beats</span>
            </div>
          </section>

          {/* Sample Loader */}
          <section className={styles.section}>
            <label className={styles.label}>Sample Loader</label>
            <div className={styles.row}>
              <button className={styles.btn} onClick={() => fileInputRef.current?.click()}>
                Charger un fichier audio
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                style={{ display: 'none' }}
                onChange={handleFileLoad}
              />
            </div>
            {sampleLog && <p className={styles.log}>{sampleLog}</p>}
          </section>

        </div>
      </main>
    </div>
  );
}
