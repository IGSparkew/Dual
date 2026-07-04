import { useEffect, useRef, useState } from 'react';
import styles from '../MixerModule.module.css';

interface FaderProps {
  /** Committed value (from the document). */
  value: number;
  min: number;
  max: number;
  /** Value restored on double-click. */
  resetValue: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}

const WHEEL_COMMIT_MS = 200;

/**
 * Vertical fader. The document is only written on commit: pointer release,
 * double-click reset, or a debounced wheel step — never during the drag
 * (every write re-evaluates the audio).
 */
export function Fader({ value, min, max, resetValue, disabled, onCommit }: FaderProps) {
  // Local value while interacting; null = mirror the committed prop.
  const [local, setLocal] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const wheelTimer = useRef<number | null>(null);
  const localRef = useRef<number | null>(null);
  localRef.current = local;

  useEffect(
    () => () => {
      if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
    },
    [],
  );

  const shown = local ?? value;
  const fraction = (shown - min) / (max - min);

  const valueAt = (clientY: number): number => {
    const rect = trackRef.current!.getBoundingClientRect();
    const f = 1 - (clientY - rect.top) / rect.height;
    return min + Math.min(1, Math.max(0, f)) * (max - min);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setLocal(valueAt(e.clientY));
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (disabled || localRef.current === null) return;
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    setLocal(valueAt(e.clientY));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (localRef.current === null) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const committed = localRef.current;
    setLocal(null);
    onCommit(committed);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (disabled) return;
    const step = (max - min) / 40;
    const next = Math.min(max, Math.max(min, shown + (e.deltaY < 0 ? step : -step)));
    setLocal(next);
    if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(() => {
      wheelTimer.current = null;
      setLocal(null);
      onCommit(next);
    }, WHEEL_COMMIT_MS);
  };

  return (
    <div
      ref={trackRef}
      className={styles.faderTrack}
      data-disabled={disabled || undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={() => !disabled && onCommit(resetValue)}
      onWheel={handleWheel}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={shown}
    >
      <div className={styles.faderFill} style={{ height: `${fraction * 100}%` }} />
      {/* Tick at the reset value (unity gain). */}
      <div
        className={styles.faderTick}
        style={{ bottom: `${((resetValue - min) / (max - min)) * 100}%` }}
      />
      <div className={styles.faderThumb} style={{ bottom: `${fraction * 100}%` }} />
    </div>
  );
}
