import styles from '../MixerModule.module.css';

interface VuMeterProps {
  /** Registers the canvas with the module's single rAF loop (null on unmount). */
  onCanvas: (el: HTMLCanvasElement | null) => void;
}

/** Activity meter — a bare canvas; all drawing happens in the module loop. */
export function VuMeter({ onCanvas }: VuMeterProps) {
  return <canvas ref={onCanvas} className={styles.vuMeter} />;
}
