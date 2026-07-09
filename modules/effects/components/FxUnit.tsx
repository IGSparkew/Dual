import { Lock, X } from 'lucide-react';
import type { RackUnit, UnitDef } from '../effects';
import { Knob } from './Knob';
import styles from '../EffectsModule.module.css';

interface FxUnitProps {
  unit: RackUnit;
  disabled: boolean;
  /** Candidate victim clips for a target unit (duck) — every clip but the
   *  rack's own. Ignored by units without a target facet. */
  targetChoices: string[];
  onParam: (unit: UnitDef, method: string, value: number) => void;
  onEnum: (unit: UnitDef, choice: string) => void;
  onTarget: (unit: UnitDef, victim: string) => void;
  onRemove: (unit: UnitDef) => void;
}

/**
 * One rack unit: title, knobs (or vowel dropdown; duck adds a victim-clip
 * dropdown before its knobs), remove button. A locked unit ("managed in
 * code": pattern strings, const refs, duplicated params, unresolvable duck
 * target) is shown but read-only — the Code Editor owns it and the rack
 * preserves it.
 */
export function FxUnit({
  unit,
  disabled,
  targetChoices,
  onParam,
  onEnum,
  onTarget,
  onRemove,
}: FxUnitProps) {
  const frozen = disabled || unit.locked;

  return (
    <div className={styles.unit} data-locked={unit.locked || undefined}>
      <div className={styles.unitHeader}>
        <span className={styles.unitName}>{unit.def.name}</span>
        {unit.locked && (
          <span
            className={styles.unitLocked}
            title="Géré dans le code — édite cette unité dans le Code Editor"
          >
            <Lock size={9} />
            code
          </span>
        )}
        <button
          className={styles.unitRemove}
          disabled={frozen}
          onClick={() => onRemove(unit.def)}
          title="Supprimer l'effet"
        >
          <X size={11} />
        </button>
      </div>

      {unit.def.target && (
        <div className={styles.unitTargetRow}>
          <select
            className={styles.unitSelect}
            value={unit.targetClip ?? ''}
            disabled={frozen || targetChoices.length === 0}
            onChange={(e) => onTarget(unit.def, e.target.value)}
            title="Clip victime — son orbit est atténué à chaque hap de ce clip"
          >
            <option value="" disabled>
              cible…
            </option>
            {/* An unresolvable-but-shown target keeps its own entry so the
                select does not silently jump to another clip. */}
            {unit.targetClip !== null && !targetChoices.includes(unit.targetClip) && (
              <option value={unit.targetClip}>{unit.targetClip}</option>
            )}
            {targetChoices.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.unitBody}>
        {unit.def.enum ? (
          <select
            className={styles.unitSelect}
            value={unit.enumValue ?? unit.def.enum.defaultValue}
            disabled={frozen}
            onChange={(e) => onEnum(unit.def, e.target.value)}
          >
            {unit.def.enum.choices.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        ) : (
          unit.params.map((param) => (
            <Knob
              key={param.def.method}
              def={param.def}
              value={param.value ?? param.def.defaultValue}
              disabled={frozen}
              onCommit={(v) => onParam(unit.def, param.def.method, v)}
            />
          ))
        )}
      </div>
    </div>
  );
}
