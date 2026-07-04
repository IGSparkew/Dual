import { useEffect, useRef, useState } from 'react';
import styles from '../MixerModule.module.css';

interface PanKnobProps {
  /** Committed value, Strudel-native 0..1 (0.5 = center). */
  value: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}

const WHEEL_COMMIT_MS = 200;
/** Vertical drag distance (px) that sweeps the full 0..1 range. */
const DRAG_RANGE_PX = 150;
const RESET = 0.5;

/** L/C/R display label for a 0..1 pan value. */
function panLabel(v: number): string {
  const amount = Math.round((v - 0.5) * 200);
  if (amount === 0) return 'C';
  return amount < 0 ? `L${-amount}` : `R${amount}`;
}

/**
 * Pan knob (vertical drag). Same commit discipline as the fader: the document
 * is written on release / debounced wheel only, never during the drag.
 */
export function PanKnob({ value, disabled, onCommit }: PanKnobProps) {
  const [local, setLocal] = useState<number | null>(null);
  const dragStart = useRef<{ y: number; value: number } | null>(null);
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
  const angle = -135 + shown * 270;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { y: e.clientY, value: shown };
    setLocal(shown);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (disabled || !dragStart.current) return;
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const delta = (dragStart.current.y - e.clientY) / DRAG_RANGE_PX;
    setLocal(Math.min(1, Math.max(0, dragStart.current.value + delta)));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragStart.current = null;
    const committed = localRef.current;
    setLocal(null);
    if (committed !== null) onCommit(committed);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (disabled) return;
    const next = Math.min(1, Math.max(0, shown + (e.deltaY < 0 ? 0.025 : -0.025)));
    setLocal(next);
    if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(() => {
      wheelTimer.current = null;
      setLocal(null);
      onCommit(next);
    }, WHEEL_COMMIT_MS);
  };

  return (
    <div className={styles.panWrap}>
      <div
        className={styles.panKnob}
        data-disabled={disabled || undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={() => !disabled && onCommit(RESET)}
        onWheel={handleWheel}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={shown}
      >
        <div className={styles.panPointer} style={{ transform: `rotate(${angle}deg)` }} />
      </div>
      <span className={styles.panLabel}>{panLabel(shown)}</span>
    </div>
  );
}
