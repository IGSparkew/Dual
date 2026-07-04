import { useCallback, useEffect, useState } from 'react';
import type { PanelProps } from '@layout/registry/PanelRegistry';
import type { GraphError } from '@core/interpreter/CodeRegion';
import { useStore } from '@core/state/store';
import {
  addSection,
  buildArrange,
  deriveArrangement,
  deriveTrackNames,
  locateArrange,
  moveSection,
  removeSection,
  setDuration,
  toggleMember,
  type Section,
} from './arrangement';
import { ArrangementToolbar } from './components/ArrangementToolbar';
import { Timeline } from './components/Timeline';
import styles from './ArrangementModule.module.css';

/**
 * Arrangement — horizontal timeline over the `arrange(...)` call.
 *
 * In arrangement mode the document's output is the source of truth: every edit
 * rewrites it through `setOutput` + `write` (audio follows). In session mode
 * the arrange lives dormant in `store.arrangementCode`: edits are offline —
 * they never touch the document — and materialize on the next mode toggle
 * (owned by the session toolbar). On mismatch (the user rewrote the output by
 * hand) the panel turns read-only; it never repairs the user's code.
 */
export function ArrangementModule({ api }: PanelProps) {
  const [sections, setSections] = useState<Section[] | null>(null);
  const [tracks, setTracks] = useState<string[]>([]);
  const [errors, setErrors] = useState<GraphError[]>([]);

  const outputMode = useStore((s) => s.outputMode);
  const arrangementCode = useStore((s) => s.arrangementCode);

  const frozen = errors.length > 0;

  /** Re-derive the whole model from the current document + store. */
  const refresh = useCallback(() => {
    const code = api.getCode();
    const defs = api.code.list(code);
    if (defs === null) return; // parse error — keep the current view
    setTracks(deriveTrackNames(api.code, defs));
    setErrors(api.code.validateGraph(defs));

    const store = useStore.getState();
    const loc = locateArrange(api.code, code, store.arrangementCode, store.outputMode);
    setSections(loc ? deriveArrangement(api.code, loc.source) : null);
  }, [api]);

  // Refresh on hand edits of the document, and whenever the mode or the
  // dormant arrange copy change (the session toolbar owns the mode toggle).
  useEffect(() => {
    refresh();
    return api.on('code:changed', () => {
      // React to hand edits AND writes from other panels (session, mixer, ...).
      refresh();
    });
  }, [api, refresh]);
  useEffect(() => refresh(), [outputMode, arrangementCode, refresh]);

  /** Route a model edit to the document (live) or the store (dormant). */
  const commit = (next: Section[]) => {
    if (frozen) return;
    const text = buildArrange(next);
    if (useStore.getState().outputMode === 'arrangement') {
      api.code.write(api.code.setOutput(api.getCode(), text));
      refresh();
    } else {
      // Offline edit: the store change triggers the arrangementCode effect.
      useStore.getState().setArrangementCode(text);
    }
  };

  const handleToggle = (index: number, name: string) =>
    sections && commit(toggleMember(sections, index, name));
  const handleDuration = (index: number, duration: number) =>
    sections && commit(setDuration(sections, index, duration));
  const handleMove = (from: number, to: number) =>
    sections && commit(moveSection(sections, from, to));
  const handleRemove = (index: number) => sections && commit(removeSection(sections, index));
  const handleAddSection = () => commit(addSection(sections ?? []));

  // Members referenced by the arrange but not declared as clips: shown as
  // phantom (read-only) rows so a hand-written dead name stays visible.
  const trackSet = new Set(tracks);
  const phantoms = new Set(
    (sections ?? []).flatMap((s) => s.members).filter((m) => !trackSet.has(m)),
  );
  const rows = [...tracks, ...phantoms];

  // ─── Render ─────────────────────────────────────────────────────────────────

  const mismatch = outputMode === 'arrangement' && sections === null;
  const empty = outputMode === 'session' && sections === null;

  return (
    <div className={styles.panel}>
      <ArrangementToolbar
        mode={outputMode}
        addDisabled={frozen || mismatch}
        onAddSection={handleAddSection}
      />

      {frozen && (
        <div className={styles.errorBanner} role="alert">
          <span className={styles.errorTitle}>Graphe invalide — panneau gelé</span>
          {errors.slice(0, 4).map((e, i) => (
            <span key={i} className={styles.errorLine}>
              {e.detail}
            </span>
          ))}
        </div>
      )}

      {!frozen && mismatch && (
        <div className={styles.infoBanner}>
          La sortie n'est plus un <code>arrange(...)</code> — panneau en lecture seule.
        </div>
      )}

      {!frozen && !mismatch && outputMode === 'session' && sections !== null && (
        <div className={styles.infoBanner}>
          Mode session actif — édition hors-ligne, appliquée au passage en arrangement.
        </div>
      )}

      {empty ? (
        <div className={styles.empty}>
          <span>Aucun arrangement.</span>
          <button
            className={styles.toolbarBtn}
            disabled={frozen}
            onClick={() => commit(addSection([]))}
          >
            Créer l'arrangement
          </button>
        </div>
      ) : sections !== null ? (
        <Timeline
          tracks={rows}
          phantoms={phantoms}
          sections={sections}
          disabled={frozen}
          onToggle={handleToggle}
          onDuration={handleDuration}
          onMove={handleMove}
          onRemove={handleRemove}
        />
      ) : null}
    </div>
  );
}
