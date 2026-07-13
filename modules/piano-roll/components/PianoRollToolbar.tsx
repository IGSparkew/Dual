import type { PianoRoll, RollClip } from '../piano-roll';
import styles from '../PianoRollModule.module.css';

interface PianoRollToolbarProps {
  clips: RollClip[];
  active: string | null;
  roll: PianoRoll | null;
  stepChoices: readonly number[];
  onSelectClip: (name: string) => void;
  onStepCount: (n: number) => void;
}

/** Clip picker + step count — same layout as the drum grid toolbar. */
export function PianoRollToolbar({
  clips,
  active,
  roll,
  stepChoices,
  onSelectClip,
  onStepCount,
}: PianoRollToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarGroup}>
        <span className={styles.toolbarLabel}>Clip</span>
        <select
          className={styles.select}
          value={active ?? ''}
          disabled={clips.length === 0}
          onChange={(e) => onSelectClip(e.target.value)}
        >
          {clips.map((clip) => (
            <option key={clip.name} value={clip.name}>
              {clip.name}
              {clip.roll === null ? ' (complexe)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.toolbarGroup}>
        <span className={styles.toolbarLabel}>Pas</span>
        <select
          className={styles.select}
          value={roll?.stepCount ?? 16}
          disabled={!roll}
          onChange={(e) => onStepCount(Number(e.target.value))}
        >
          {stepChoices.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          {/* Hand-written step count outside the choices — keep it selectable. */}
          {roll && !stepChoices.includes(roll.stepCount) && (
            <option value={roll.stepCount}>{roll.stepCount}</option>
          )}
        </select>
      </div>
    </div>
  );
}
