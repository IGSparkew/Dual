import { useEffect, useRef, useState } from 'react';
import { displayParam, normToParam, paramToNorm, type ParamDef } from '../effects';
import styles from '../EffectsModule.module.css';

interface KnobProps {
  def: ParamDef;
  /** Committed param value (native units — Hz, seconds, 0..1…). */
  value: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}

const WHEEL_COMMIT_MS = 200;
/** Vertical drag distance (px) that sweeps the full knob range. */
const DRAG_RANGE_PX = 150;
const WHEEL_STEP = 0.025;

/**
 * Generic FX knob (vertical drag). Same commit discipline as the mixer's
 * fader/pan: the document is written on release / debounced wheel only, never
 * during the drag (a `roomsize` write regenerates the reverb's impulse
 * response — continuous writes would stutter).
 *
 * Internally normalized 0..1; scale (log/lin) and inversion (crush) live in
 * the pure mapping helpers of effects.ts.
 */
export function Knob({ def, value, disabled, onCommit }: KnobProps) {
  // Local normalized position while dragging, null when idle.
  const [local, setLocal] = useState<number | null>(null);
  const dragStart = useRef<{ y: number; norm: number } | null>(null);
  const wheelTimer = useRef<number | null>(null);
  const localRef = useRef<number | null>(null);
  localRef.current = local;

  useEffect(
    () => () => {
      if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
    },
    [],
  );

  const shown = local ?? paramToNorm(def, value);
  const shownValue = local !== null ? normToParam(def, local) : value;
  const angle = -135 + shown * 270;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { y: e.clientY, norm: shown };
    setLocal(shown);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (disabled || !dragStart.current) return;
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const delta = (dragStart.current.y - e.clientY) / DRAG_RANGE_PX;
    setLocal(Math.min(1, Math.max(0, dragStart.current.norm + delta)));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragStart.current = null;
    const committed = localRef.current;
    setLocal(null);
    if (committed !== null) onCommit(normToParam(def, committed));
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (disabled) return;
    const next = Math.min(1, Math.max(0, shown + (e.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP)));
    setLocal(next);
    if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(() => {
      wheelTimer.current = null;
      setLocal(null);
      onCommit(normToParam(def, next));
    }, WHEEL_COMMIT_MS);
  };

  return (
    <div className={styles.knobWrap}>
      <div
        className={styles.knob}
        data-disabled={disabled || undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={() => !disabled && onCommit(def.defaultValue)}
        onWheel={handleWheel}
        role="slider"
        aria-label={def.label}
        aria-valuemin={def.min}
        aria-valuemax={def.max}
        aria-valuenow={shownValue}
      >
        <div className={styles.knobPointer} style={{ transform: `rotate(${angle}deg)` }} />
      </div>
      <span className={styles.knobValue}>{displayParam(def, shownValue)}</span>
      <span className={styles.knobLabel}>{def.label}</span>
    </div>
  );
}
