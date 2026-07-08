import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { PanelProps } from '@layout/registry/PanelRegistry';
import {
  absentUnits,
  addEffect,
  deriveClipNames,
  deriveRack,
  removeEffect,
  setEnum,
  setParam,
  toFxChain,
  type Rack,
  type UnitDef,
} from './effects';
import { FxUnit } from './components/FxUnit';
import styles from './EffectsModule.module.css';

/**
 * FX Rack — the effect chain of the selected clip, derived from its chained
 * calls (`const BASS = s("bd sd").lpf(800).room(0.4)`). The code is the truth:
 * every knob commit is a splice on the clip's initializer; every hand edit
 * re-derives the rack. Out-of-catalog links (gain, fast, advanced params) are
 * invisible here and preserved intact by every write.
 *
 * Units render in superdough's processing order (what the ear hears), not the
 * textual order of the `.method()` calls, which has no audible effect.
 */
export function EffectsModule({ api }: PanelProps) {
  const [clips, setClips] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [rack, setRack] = useState<Rack | null>(null);
  const activeRef = useRef<string | null>(null);

  const setActiveClip = (name: string | null) => {
    activeRef.current = name;
    setActive(name);
  };

  /** Re-derive the whole model from the current document. */
  const refresh = useCallback(() => {
    const code = api.getCode();
    const defs = api.code.list(code);
    if (defs === null) return; // parse error — keep the current view
    const names = deriveClipNames(api.code, defs);
    setClips(names);

    // Keep the selection when it still exists, else fall back to the first clip.
    let name = activeRef.current;
    if (!name || !names.includes(name)) name = names[0] ?? null;
    setActiveClip(name);
    setRack(name ? deriveRack(api.code, code, name) : null);
  }, [api]);

  useEffect(() => {
    refresh();
    // React to hand edits AND writes from other panels; reacting to our own
    // writes re-derives the rack, which is the intent.
    return api.on('code:changed', refresh);
  }, [api, refresh]);

  // Follow the clip selected in the session grid / mixer badges.
  useEffect(
    () =>
      api.on('clip:selected', ({ clipId }) => {
        setActiveClip(clipId);
        refresh();
      }),
    [api, refresh],
  );

  // ─── Commits (one write each, then re-derive + notify) ──────────────────────

  /** Apply new document text, re-derive, and broadcast the new chain. */
  const apply = (next: string) => {
    const name = activeRef.current;
    if (!name) return;
    api.code.write(next);
    refresh();
    const after = deriveRack(api.code, api.getCode(), name);
    api.emit('fx:changed', { clipId: name, fxChain: after ? toFxChain(after) : [] });
  };

  const handleAdd = (unit: UnitDef) => {
    const name = activeRef.current;
    if (!name) return;
    apply(addEffect(api.code, api.getCode(), name, unit));
  };

  const handleParam = (unit: UnitDef, method: string, value: number) => {
    const name = activeRef.current;
    const param = unit.params.find((p) => p.method === method);
    if (!name || !param) return;
    apply(setParam(api.code, api.getCode(), name, param, value));
  };

  const handleEnum = (unit: UnitDef, choice: string) => {
    const name = activeRef.current;
    if (!name) return;
    apply(setEnum(api.code, api.getCode(), name, unit, choice));
  };

  const handleRemove = (unit: UnitDef) => {
    const name = activeRef.current;
    if (!name) return;
    apply(removeEffect(api.code, api.getCode(), name, unit));
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const addable = rack ? absentUnits(rack) : [];

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <span className={styles.toolbarLabel}>Clip</span>
          <select
            className={styles.select}
            value={active ?? ''}
            disabled={clips.length === 0}
            onChange={(e) => {
              setActiveClip(e.target.value);
              refresh();
            }}
          >
            {clips.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.toolbarGroup}>
          <Plus size={12} className={styles.addIcon} />
          <select
            className={styles.select}
            value=""
            disabled={active === null || addable.length === 0}
            onChange={(e) => {
              const unit = addable.find((u) => u.id === e.target.value);
              if (unit) handleAdd(unit);
            }}
            title="Ajouter un effet au clip"
          >
            <option value="" disabled>
              Ajouter un effet…
            </option>
            {addable.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {clips.length === 0 ? (
        <div className={styles.empty}>Aucun clip — crée un clip dans la Session.</div>
      ) : rack === null || rack.units.length === 0 ? (
        <div className={styles.empty}>Aucun effet sur « {active} » — ajoute-en un.</div>
      ) : (
        <div className={styles.units}>
          {rack.units.map((unit) => (
            <FxUnit
              key={unit.def.id}
              unit={unit}
              disabled={false}
              onParam={handleParam}
              onEnum={handleEnum}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
