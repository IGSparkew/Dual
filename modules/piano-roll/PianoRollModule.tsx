import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PanelProps } from '@layout/registry/PanelRegistry';
import {
  addNote,
  deriveClips,
  moveNote,
  nearestInScale,
  noteToken,
  removeNote,
  resizeNote,
  setStepCount,
  writeRoll,
  writeScaleState,
  STEP_CHOICES,
  type PianoRoll,
  type RollClip,
  type RollNote,
  type ScaleSpec,
  type ScaleState,
} from './piano-roll';
import { rescaleStepCount, writeCycles } from '@modules/shared/loop-length';
import { PianoRollToolbar } from './components/PianoRollToolbar';
import { drawRoll, ROW_HEIGHT, visibleMidis } from './components/piano-roll-renderer';
import { cellAt, hitTest, type RollHit } from './components/note-interaction';
import styles from './PianoRollModule.module.css';

/** One in-flight pointer gesture — committed to the document on pointer up. */
interface DragState {
  index: number;
  mode: 'move' | 'resize';
  /** Step offset inside the note where the move grabbed it. */
  grabStep: number;
  /** The roll with the gesture applied so far (drawn instead of `roll`). */
  preview: PianoRoll;
  moved: boolean;
}

/**
 * Piano Roll — MIDI-style note editor over a named clip's content.
 *
 * The roll edits the arguments of the clip's `stack(...)` as bare
 * `note("...")` voices: left click on an empty cell adds a note, right click
 * on a note deletes it, dragging a note moves it (pitch + step) and dragging
 * its right edge resizes its `@n` weight. Each gesture commits exactly one
 * write on pointer up (adds and deletes commit immediately).
 */
export function PianoRollModule({ api }: PanelProps) {
  const [clips, setClips] = useState<RollClip[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [roll, setRoll] = useState<PianoRoll | null>(null);
  const [hover, setHover] = useState<RollHit | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  // Visual-aid scale picked before the code is written (« Écrire .scale() »
  // unchecked) — a per-clip choice, reset when the active clip changes.
  const [localScale, setLocalScale] = useState<ScaleSpec | null>(null);
  // Purely cosmetic — whether the picked scale dims/highlights the grid at all.
  // Independent from `scaleOn` (code-writing mode, which still enforces exact
  // scale tones via `snapToScale` regardless of this toggle).
  const [showScale, setShowScale] = useState(true);
  // Label every gutter key with its note name (not just the Cs).
  const [showNoteNames, setShowNoteNames] = useState(false);

  const activeRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Span applied to newly added notes — the last committed resize wins.
  const lastSpanRef = useRef(1);

  const setActiveClip = (name: string | null) => {
    // Reset the visual-aid scale only on an actual clip switch — `refresh`
    // calls this on every `code:changed` (including our own writes) with the
    // SAME name, which must not wipe out the pick mid-edit.
    if (name !== activeRef.current) setLocalScale(null);
    activeRef.current = name;
    setActive(name);
  };

  /** Re-derive the whole model from the current document. */
  const refresh = useCallback(() => {
    const code = api.getCode();
    const defs = api.code.list(code);
    if (defs === null) return; // parse error — keep the current view
    const list = deriveClips(api.code, code, defs);
    setClips(list);

    let name = activeRef.current;
    if (!name || !list.some((c) => c.name === name)) name = list[0]?.name ?? null;
    setActiveClip(name);
    setRoll(name ? list.find((c) => c.name === name)!.roll : null);
  }, [api]);

  useEffect(() => {
    refresh();
    // React to hand edits AND writes from other panels; reacting to our own
    // writes re-derives (and normalizes) the roll, which is the intent.
    return api.on('code:changed', refresh);
  }, [api, refresh]);

  // Follow the clip selected in the session grid.
  useEffect(
    () =>
      api.on('clip:selected', ({ clipId }) => {
        setActiveClip(clipId);
        refresh();
      }),
    [api, refresh],
  );

  // The roll as drawn: the drag preview replaces the derived model mid-gesture.
  const displayed = drag ? drag.preview : roll;

  // Scale mode: `scaleOn` reflects the clip's managed `.scale(...)`;
  // `effectiveScale` is what the grid/gutter actually dim — the clip's spec
  // when written, else the not-yet-written local pick.
  const scaleOn = roll?.scaleState?.kind === 'on';
  const effectiveScale: ScaleSpec | null = scaleOn
    ? (roll!.scaleState as { kind: 'on'; spec: ScaleSpec }).spec
    : localScale;

  // « Lock scale »: the clip's `.scale(...)` is written AND the grid folds to
  // its tones (only in-scale rows shown, Ableton-style). Safe because every
  // stored note is already an exact scale tone in that mode (see snapToScale).
  const folded = scaleOn && effectiveScale !== null;
  // The displayed pitch rows: every semitone, or only the scale's tones when
  // folded. Shared by the renderer's layout and the hit test.
  const rows = useMemo(
    () => visibleMidis(folded ? effectiveScale : null),
    [folded, effectiveScale?.rootChroma, effectiveScale?.typeId],
  );
  // Highlight the scale whenever folded (root orientation) or when the cosmetic
  // « Afficher sur la grille » is on with a picked root.
  const highlightScale = folded || showScale ? effectiveScale : null;

  // Center the vertical scroll around c3 (midi 48) when the clip changes or the
  // layout folds/unfolds — the row of the first pitch ≤ 48 (rows are
  // descending), so it works whether or not c3 itself is an in-scale row.
  useEffect(() => {
    const wrap = scrollRef.current;
    if (!wrap) return;
    const row = Math.max(0, rows.findIndex((m) => m <= 48));
    wrap.scrollTop = row * ROW_HEIGHT - wrap.clientHeight / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, folded]);

  // Mirror for the draw loop (reads outside React's render cycle).
  const viewRef = useRef<{
    roll: PianoRoll | null;
    rows: number[];
    hover: RollHit | null;
    dragIndex: number | null;
    scale: ScaleSpec | null;
    folded: boolean;
    showNoteNames: boolean;
  }>({ roll: null, rows: [], hover: null, dragIndex: null, scale: null, folded: false, showNoteNames: false });
  viewRef.current = {
    roll: displayed,
    rows,
    hover: drag ? null : hover,
    dragIndex: drag?.index ?? null,
    scale: highlightScale,
    folded,
    showNoteNames,
  };

  // ─── Draw loop (roll + playhead, via the canvas API) ────────────────────────

  useEffect(
    () =>
      api.canvas.loop(() => {
        const canvas = canvasRef.current;
        const view = viewRef.current;
        if (!canvas || !view.roll) return;
        // 4 beats = 1 cycle — same convention as the drum grid.
        const { status, position } = api.getTransport();
        const playhead = status === 'playing' ? ((position / 4) % 1 + 1) % 1 : null;
        const surface = api.canvas.surface(canvas);
        if (surface) {
          drawRoll(surface, {
            roll: view.roll,
            rows: view.rows,
            hover: view.hover,
            dragIndex: view.dragIndex,
            playhead,
            scale: view.scale,
            folded: view.folded,
            showNoteNames: view.showNoteNames,
          });
        }
      }),
    [api],
  );

  // ─── Commits (one write each) ───────────────────────────────────────────────

  const applyRoll = (next: PianoRoll) => {
    const name = activeRef.current;
    if (!name) return;
    setRoll(next); // optimistic — refresh re-derives from the document
    api.code.write(writeRoll(api.code, api.getCode(), name, next));
  };

  // « Pas » is steps per measure — the document holds the total step count.
  const handleStepCount = (perMeasure: number) => {
    if (!roll) return;
    applyRoll(setStepCount(roll, Math.round(perMeasure * (roll.cycles ?? 1))));
  };

  // « Mesures »: keep the per-step duration constant — when the total divides
  // evenly by the old cycle count, extend (notes preserved, silence appended)
  // or crop the content to `perMeasure × m` steps; otherwise only the `.slow`
  // factor changes. Both the content splice and the `.slow` splice land in
  // ONE write (each helper re-resolves its offsets from the text it receives).
  // The appended `.slow(m)` sits at the end of the chain, so it also stretches
  // the patterned arguments of FX chained before it (e.g. `.lpf("400 800")`)
  // — intended: the whole clip loops over m measures.
  const handleCycles = (m: number) => {
    const name = activeRef.current;
    if (!name || !roll || roll.cycles === null) return; // unmanaged `.slow` — hands off
    const c = roll.cycles ?? 1;
    if (m === c) return;
    const total = rescaleStepCount(roll.stepCount, c, m);
    const next: PianoRoll = { ...setStepCount(roll, total), cycles: m };
    setRoll(next); // optimistic — refresh re-derives from the document
    let text = writeRoll(api.code, api.getCode(), name, next);
    text = writeCycles(api.code, text, name, m);
    api.code.write(text);
  };

  // Scale mode toggle / spec change: quantizes the notes to the new scale
  // (merging any resulting same-pitch overlaps) and writes the content +
  // `.scale(...)` in ONE go — same combined-write pattern as `handleCycles`.
  const applyScaleState = (next: ScaleState) => {
    const name = activeRef.current;
    if (!name || !roll) return;
    let nextRoll = roll;
    if (next.kind === 'on') {
      const quantized = roll.notes.map((n) => ({ ...n, midi: nearestInScale(n.midi, next.spec) }));
      const deduped: RollNote[] = [];
      for (const n of quantized) {
        const overlap = deduped.some(
          (d) => d.midi === n.midi && d.step < n.step + n.span && n.step < d.step + d.span,
        );
        if (!overlap) deduped.push(n);
      }
      if (deduped.length < roll.notes.length) {
        api.showNotification(
          'Certaines notes se sont superposées après quantification vers la gamme et ont été fusionnées',
          'info',
        );
      }
      nextRoll = { ...roll, notes: deduped, scaleState: next };
    } else {
      nextRoll = { ...roll, scaleState: next };
    }
    setRoll(nextRoll); // optimistic — refresh re-derives from the document
    let text = writeRoll(api.code, api.getCode(), name, nextRoll);
    text = writeScaleState(api.code, text, name, next);
    api.code.write(text);
  };

  const handleScaleSpecChange = (spec: ScaleSpec | null) => {
    setLocalScale(spec);
    if (scaleOn) {
      applyScaleState(spec ? { kind: 'on', spec } : { kind: 'off' });
    }
  };

  const handleScaleOnChange = (on: boolean) => {
    if (!roll) return;
    if (on) {
      if (localScale) applyScaleState({ kind: 'on', spec: localScale });
    } else {
      const spec = scaleOn ? (roll.scaleState as { kind: 'on'; spec: ScaleSpec }).spec : null;
      applyScaleState({ kind: 'off' });
      setLocalScale(spec);
    }
  };

  const emitNote = (type: 'note:created' | 'note:deleted', note: RollNote, total: number) => {
    api.emit(type, {
      note: noteToken(note.midi),
      begin: note.step / total,
      end: (note.step + note.span) / total,
    });
  };

  // ─── Canvas events ──────────────────────────────────────────────────────────

  // When the clip's `.scale(...)` is written, every stored note must be an
  // exact scale tone — snap BEFORE add/move (resize never touches pitch).
  const snapToScale = (midi: number): number =>
    roll?.scaleState?.kind === 'on' ? nearestInScale(midi, roll.scaleState.spec) : midi;

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !roll || drag) return;
    const hit = hitTest(canvas, roll, rows, e.clientX, e.clientY);
    if (!hit) return;
    e.preventDefault();

    if (hit.kind === 'note') {
      if (e.button === 2) {
        const note = roll.notes[hit.index];
        applyRoll(removeNote(roll, hit.index));
        emitNote('note:deleted', note, roll.stepCount);
        return;
      }
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      setDrag({
        index: hit.index,
        mode: hit.edge ? 'resize' : 'move',
        grabStep: hit.step - roll.notes[hit.index].step,
        preview: roll,
        moved: false,
      });
      return;
    }

    // Empty cell: add a note with the last used span.
    if (e.button !== 0) return;
    const next = addNote(roll, snapToScale(hit.midi), hit.step, lastSpanRef.current);
    if (next === roll) {
      // Rejected: a same-pitch note already covers this range.
      api.showNotification('Ajout refusé — une note de même hauteur occupe déjà ce pas', 'info');
      return;
    }
    applyRoll(next);
    emitNote('note:created', next.notes[next.notes.length - 1], next.stepCount);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !roll) return;

    if (drag) {
      const cell = cellAt(canvas, roll, rows, e.clientX, e.clientY);
      const preview =
        drag.mode === 'move'
          ? moveNote(roll, drag.index, snapToScale(cell.midi), cell.step - drag.grabStep)
          : resizeNote(roll, drag.index, cell.step - roll.notes[drag.index].step + 1);
      setDrag({ ...drag, preview, moved: true });
      return;
    }
    setHover(hitTest(canvas, roll, rows, e.clientX, e.clientY));
  };

  const handlePointerUp = () => {
    if (!drag) return;
    setDrag(null);
    if (!drag.moved || drag.preview === roll) return;
    if (drag.mode === 'resize') lastSpanRef.current = drag.preview.notes[drag.index].span;
    applyRoll(drag.preview);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const complex = active !== null && roll === null;
  const resizing =
    drag?.mode === 'resize' || (!drag && hover?.kind === 'note' && hover.edge);
  const cursor = resizing ? 'ew-resize' : drag || hover?.kind === 'note' ? 'move' : 'pointer';

  return (
    <div className={styles.panel}>
      <PianoRollToolbar
        clips={clips}
        active={active}
        roll={roll}
        stepChoices={STEP_CHOICES}
        onSelectClip={(name) => {
          setActiveClip(name);
          refresh();
        }}
        onStepCount={handleStepCount}
        onCycles={handleCycles}
        scaleSpec={effectiveScale}
        scaleOn={scaleOn}
        onScaleSpecChange={handleScaleSpecChange}
        onScaleOnChange={handleScaleOnChange}
        showScale={showScale}
        onShowScaleChange={setShowScale}
        showNoteNames={showNoteNames}
        onShowNoteNamesChange={setShowNoteNames}
      />

      {clips.length === 0 && (
        <div className={styles.empty}>Aucun clip — crée un clip dans la Session.</div>
      )}

      {complex && (
        <div className={styles.infoBanner}>
          Contenu de « {active} » trop complexe pour le piano roll — édite-le dans le Code
          Editor.
        </div>
      )}

      {displayed && (
        <div className={styles.scrollArea} ref={scrollRef}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            style={{ height: rows.length * ROW_HEIGHT, cursor }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => setHover(null)}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
      )}

      {displayed && (
        <div className={styles.hint}>
          clic = ajouter une note · clic droit = supprimer · glisser = déplacer · bord droit =
          durée
        </div>
      )}
    </div>
  );
}
