import { useState } from 'react';
import { Merge, Split, Plus } from 'lucide-react';
import type { DrumGrid, GridClip } from '../drum-grid';
import styles from '../DrumGridModule.module.css';

interface DrumGridToolbarProps {
  clips: GridClip[];
  active: string | null;
  grid: DrumGrid | null;
  /** Active clip's drum machine bank (null = none / unmanaged). */
  bank: string | null;
  stepChoices: readonly number[];
  sampleSuggestions: string[];
  bankChoices: string[];
  onSelectClip: (name: string) => void;
  onStepCount: (n: number) => void;
  onToggleForm: () => void;
  onAddRow: (sample: string) => void;
  onSetBank: (bank: string) => void;
}

/** Clip picker, bank picker, step count, merged/split toggle, add-row input. */
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
  onToggleForm,
  onAddRow,
  onSetBank,
}: DrumGridToolbarProps) {
  // Starts (and resets) empty: a datalist filters by the current value, so a
  // pre-filled "bd" would hide every other suggestion.
  const [sample, setSample] = useState('');

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
          value={bank ?? ''}
          disabled={active === null}
          onChange={(e) => onSetBank(e.target.value)}
          title="Banque de batterie appliquée au clip — .bank(…)"
        >
          <option value="">— défaut</option>
          {bankChoices.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.toolbarGroup}>
        <span className={styles.toolbarLabel}>Pas</span>
        <select
          className={styles.select}
          value={grid?.stepCount ?? 16}
          disabled={!grid}
          onChange={(e) => onStepCount(Number(e.target.value))}
        >
          {stepChoices.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
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
