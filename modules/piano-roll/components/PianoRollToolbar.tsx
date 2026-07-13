import { CYCLE_CHOICES } from '@modules/shared/loop-length';
import type { PianoRoll, RollClip } from '../piano-roll';
import styles from '../PianoRollModule.module.css';

interface PianoRollToolbarProps {
  clips: RollClip[];
  active: string | null;
  roll: PianoRoll | null;
  stepChoices: readonly number[];
  onSelectClip: (name: string) => void;
  /** Steps PER MEASURE picked by the user — the module scales by `cycles`. */
  onStepCount: (n: number) => void;
  /** Loop length in cycles (« Mesures ») picked by the user. */
  onCycles: (n: number) => void;
}

/** Clip picker + measures + step count — same layout as the drum grid toolbar. */
export function PianoRollToolbar({
  clips,
  active,
  roll,
  stepChoices,
  onSelectClip,
  onStepCount,
  onCycles,
}: PianoRollToolbarProps) {
  // Loop length: an unmanaged `.slow` (non-literal, decimal, duplicated)
  // disables the « Mesures » select — same hands-off policy as "complexe".
  const unmanagedSlow = roll !== null && roll.cycles === null;
  const cycles = roll?.cycles ?? 1;
  // « Pas » shows steps per measure; a non-integer quotient (hand-written
  // counts) keeps its exact value as an ad hoc option.
  const perMeasure = roll ? roll.stepCount / cycles : 16;

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
        <span className={styles.toolbarLabel}>Mesures</span>
        <select
          className={styles.select}
          value={unmanagedSlow ? '' : cycles}
          disabled={!roll || unmanagedSlow}
          onChange={(e) => onCycles(Number(e.target.value))}
          title="Longueur de boucle en mesures (cycles) — .slow(n)"
        >
          {/* Unmanaged `.slow` — nothing selectable, the Code Editor owns it. */}
          {unmanagedSlow && <option value="">—</option>}
          {CYCLE_CHOICES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          {/* Hand-written cycle count outside the choices — keep it selectable. */}
          {!unmanagedSlow && roll && !CYCLE_CHOICES.includes(cycles) && (
            <option value={cycles}>{cycles}</option>
          )}
        </select>
      </div>

      <div className={styles.toolbarGroup}>
        <span className={styles.toolbarLabel}>Pas</span>
        <select
          className={styles.select}
          value={roll ? perMeasure : 16}
          disabled={!roll}
          onChange={(e) => onStepCount(Number(e.target.value))}
          title="Pas par mesure"
        >
          {stepChoices.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          {/* Hand-written step count outside the choices — keep it selectable. */}
          {roll && !stepChoices.includes(perMeasure) && (
            <option value={perMeasure}>{perMeasure}</option>
          )}
        </select>
      </div>
    </div>
  );
}
