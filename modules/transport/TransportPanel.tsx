import { useRef } from 'react';
import { Play, Pause, Square, FolderOpen } from 'lucide-react';
import { strudelBridge } from '@core/engine/impl/StrudelBridgeImpl';
import { scheduler } from '@core/engine/impl/SchedulerImpl';
import { sampleLoader } from '@core/engine/impl/SampleLoaderImpl';
import { useStore } from '@core/state/store';
import type { PanelProps } from '@layout/registry/PanelRegistry';
import styles from './TransportPanel.module.css';

export function TransportPanel({ api }: PanelProps) {
  const transport = useStore((s) => s.transport);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePlay = async () => {
    await strudelBridge.evaluate(api.getCode());
    scheduler.play();
  };

  const handlePause = () => scheduler.pause();
  const handleStop = () => scheduler.stop();
  const handleBpm = (e: React.ChangeEvent<HTMLInputElement>) =>
    scheduler.setBpm(Number(e.target.value));

  const handleFileLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const name = await sampleLoader.registerFile(file);
      api.modifyCode(() => `s("${name}")`);
      api.showNotification(`"${name}" chargé`, 'success');
    } catch (err) {
      api.showNotification(`Erreur : ${err}`, 'error');
    }
    e.target.value = '';
  };

  return (
    <div className={styles.bar}>
      <div className={styles.controls}>
        <button className={styles.btn} onClick={handlePlay} title="Play">
          <Play size={14} />
        </button>
        <button className={styles.btn} onClick={handlePause} title="Pause">
          <Pause size={14} />
        </button>
        <button className={styles.btn} onClick={handleStop} title="Stop">
          <Square size={14} />
        </button>
      </div>

      <div className={styles.divider} />

      <div className={styles.bpm}>
        <span className={styles.label}>BPM</span>
        <input
          type="range"
          min={40}
          max={240}
          value={transport.bpm}
          onChange={handleBpm}
          className={styles.slider}
        />
        <span className={styles.value}>{transport.bpm}</span>
      </div>

      <div className={styles.divider} />

      <span className={styles.badge} data-status={transport.status}>
        {transport.status}
      </span>
      <span className={styles.pos}>{transport.position.toFixed(2)} beats</span>

      <div className={styles.divider} />

      <button
        className={styles.btn}
        onClick={() => fileInputRef.current?.click()}
        title="Charger un sample"
      >
        <FolderOpen size={14} />
        <span>Sample</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        style={{ display: 'none' }}
        onChange={handleFileLoad}
      />
    </div>
  );
}
