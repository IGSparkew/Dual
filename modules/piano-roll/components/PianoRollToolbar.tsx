import { CYCLE_CHOICES } from '@modules/shared/loop-length';
import { SCALE_TYPES, TONAL_ROOT_NAMES, type PianoRoll, type RollClip, type ScaleSpec } from '../piano-roll';
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
  /** Scale picked for the visual aid (root + type), or reflecting the clip's
   *  managed `.scale(...)` once `scaleOn` is true. Null = "Aucune" root. */
  scaleSpec: ScaleSpec | null;
  /** Whether the clip's `.scale(...)` is written to the code. */
  scaleOn: boolean;
  onScaleSpecChange: (spec: ScaleSpec | null) => void;
  onScaleOnChange: (on: boolean) => void;
  /** Purely cosmetic — whether the picked scale dims/highlights the grid.
   *  Independent from `scaleOn`. */
  showScale: boolean;
  onShowScaleChange: (show: boolean) => void;
  /** Whether every gutter key is labelled with its note name. */
  showNoteNames: boolean;
  onShowNoteNamesChange: (show: boolean) => void;
}

/** Clip picker + measures + step count + scale — same layout as the drum grid
 *  toolbar. */
export function PianoRollToolbar({
  clips,
  active,
  roll,
  stepChoices,
  onSelectClip,
  onStepCount,
  onCycles,
  scaleSpec,
  scaleOn,
  onScaleSpecChange,
  onScaleOnChange,
  showScale,
  onShowScaleChange,
  showNoteNames,
  onShowNoteNamesChange,
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

      <div className={styles.toolbarGroup}>
        <span className={styles.toolbarLabel}>Gamme</span>
        <select
          className={styles.select}
          value={scaleSpec?.rootChroma ?? -1}
          onChange={(e) => {
            const rootChroma = Number(e.target.value);
            onScaleSpecChange(
              rootChroma < 0 ? null : { rootChroma, typeId: scaleSpec?.typeId ?? SCALE_TYPES[0].id },
            );
          }}
          title="Tonique de la gamme — aide visuelle, ou racine du .scale() écrit"
        >
          <option value={-1}>Aucune</option>
          {TONAL_ROOT_NAMES.map((label, chroma) => (
            <option key={chroma} value={chroma}>
              {label}
            </option>
          ))}
        </select>
        <select
          className={styles.select}
          value={scaleSpec?.typeId ?? SCALE_TYPES[0].id}
          disabled={scaleSpec === null}
          onChange={(e) => onScaleSpecChange({ rootChroma: scaleSpec!.rootChroma, typeId: e.target.value })}
          title="Type de gamme"
        >
          {SCALE_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={scaleOn}
            disabled={scaleSpec === null || !roll}
            onChange={(e) => onScaleOnChange(e.target.checked)}
            title="Verrouiller la gamme — écrit .scale() dans le code et replie la grille sur les seules notes de la gamme (comme Ableton)"
          />
          Lock scale
        </label>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={showScale}
            disabled={scaleSpec === null || scaleOn}
            onChange={(e) => onShowScaleChange(e.target.checked)}
            title="Afficher la gamme sur la grille — aide visuelle uniquement, sans effet sur le code (inutile quand la gamme est verrouillée)"
          />
          Afficher sur la grille
        </label>
      </div>

      <div className={styles.toolbarGroup}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={showNoteNames}
            onChange={(e) => onShowNoteNamesChange(e.target.checked)}
            title="Afficher le nom de chaque touche du clavier (pas seulement les Do)"
          />
          Noms des notes
        </label>
      </div>
    </div>
  );
}
