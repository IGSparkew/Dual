import { useState } from 'react';
import { Merge, Split, Plus } from 'lucide-react';
import { CYCLE_CHOICES } from '@modules/shared/loop-length';
import type { BankInfo, DrumGrid, GridClip } from '../drum-grid';
import styles from '../DrumGridModule.module.css';

interface DrumGridToolbarProps {
  clips: GridClip[];
  active: string | null;
  grid: DrumGrid | null;
  /** Active clip's drum machine bank (null = none / unmanaged). */
  bank: string | null;
  stepChoices: readonly number[];
  sampleSuggestions: string[];
  /** Available banks; `missing` lists the current grid's uncovered instruments. */
  bankChoices: BankInfo[];
  onSelectClip: (name: string) => void;
  /** Steps PER MEASURE picked by the user — the module scales by `cycles`. */
  onStepCount: (n: number) => void;
  /** Loop length in cycles (« Mesures ») picked by the user. */
  onCycles: (n: number) => void;
  onToggleForm: () => void;
  onAddRow: (sample: string) => void;
  onSetBank: (bank: string) => void;
}

/** Clip picker, bank picker, measures, step count, merged/split toggle,
 *  add-row input. */
export function DrumGridToolbar({
  clips,
  active,
  grid,
  bank,
  stepChoices,
  sampleSuggestions,
  bankChoices,
  onSelectClip,
  onStepCount,
  onCycles,
  onToggleForm,
  onAddRow,
  onSetBank,
}: DrumGridToolbarProps) {
  // Loop length: an unmanaged `.slow` (non-literal, decimal, duplicated)
  // disables the « Mesures » select — same hands-off policy as "complexe".
  const unmanagedSlow = grid !== null && grid.cycles === null;
  const cycles = grid?.cycles ?? 1;
  // « Pas » shows steps per measure; a non-integer quotient (hand-written
  // counts) keeps its exact value as an ad hoc option.
  const perMeasure = grid ? grid.stepCount / cycles : 16;
  // Starts (and resets) empty: a datalist filters by the current value, so a
  // pre-filled "bd" would hide every other suggestion.
  const [sample, setSample] = useState('');

  // A hand-written `.bank("rolandtr909")` matches RolandTR909 case-insensitively
  // (superdough's lookup is too) — select the canonical option instead of adding
  // a duplicate. Truly unknown banks keep their ad hoc option below.
  const canonicalBank = bank
    ? bankChoices.find((b) => b.name.toLowerCase() === bank.toLowerCase())?.name ?? bank
    : bank;

  const addRow = () => {
    const name = sample.trim();
    if (!name) return;
    onAddRow(name);
    setSample('');
  };

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
              {clip.grid === null ? ' (complexe)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.toolbarGroup}>
        <span className={styles.toolbarLabel}>Bank</span>
        <select
          className={styles.select}
          value={canonicalBank ?? ''}
          disabled={active === null}
          onChange={(e) => onSetBank(e.target.value)}
          title="Banque de batterie appliquée au clip — .bank(…)"
        >
          <option value="">— défaut</option>
          {/* Hand-written bank unknown to the sound map — keep it selectable. */}
          {canonicalBank && !bankChoices.some((b) => b.name === canonicalBank) && (
            <option value={canonicalBank}>{canonicalBank}</option>
          )}
          {bankChoices.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
              {b.missing.length > 0 ? ` — manque : ${b.missing.join(', ')}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.toolbarGroup}>
        <span className={styles.toolbarLabel}>Mesures</span>
        <select
          className={styles.select}
          value={unmanagedSlow ? '' : cycles}
          disabled={!grid || unmanagedSlow}
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
          {!unmanagedSlow && grid && !CYCLE_CHOICES.includes(cycles) && (
            <option value={cycles}>{cycles}</option>
          )}
        </select>
      </div>

      <div className={styles.toolbarGroup}>
        <span className={styles.toolbarLabel}>Pas</span>
        <select
          className={styles.select}
          value={grid ? perMeasure : 16}
          disabled={!grid}
          onChange={(e) => onStepCount(Number(e.target.value))}
          title="Pas par mesure"
        >
          {stepChoices.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          {/* Hand-written step count outside the choices — keep it selectable. */}
          {grid && !stepChoices.includes(perMeasure) && (
            <option value={perMeasure}>{perMeasure}</option>
          )}
        </select>
      </div>

      <button
        className={styles.toolbarBtn}
        disabled={!grid}
        onClick={onToggleForm}
        title={
          grid?.form === 'merged'
            ? 'Éclater en une ligne s() par sample — stack(s("bd …"), s("~ cp …"), …)'
            : 'Fusionner en une seule ligne — s("bd cp [hh hh] sd")'
        }
      >
        {grid?.form === 'merged' ? <Split size={12} /> : <Merge size={12} />}
        {grid?.form === 'merged' ? 'Split' : 'Merge'}
      </button>

      <div className={styles.toolbarGroup}>
        <input
          className={styles.input}
          list="drum-grid-samples"
          value={sample}
          disabled={!grid}
          onChange={(e) => setSample(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => e.key === 'Enter' && addRow()}
          placeholder="sample"
        />
        <datalist id="drum-grid-samples">
          {sampleSuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button
          className={styles.toolbarBtn}
          disabled={!grid || !sample.trim()}
          onClick={addRow}
          title="Ajouter une ligne"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}
