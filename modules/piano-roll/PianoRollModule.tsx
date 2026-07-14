import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanelProps } from '@layout/registry/PanelRegistry';
import {
  addNote,
  deriveClips,
  moveNote,
  noteToken,
  removeNote,
  resizeNote,
  setStepCount,
  writeRoll,
  STEP_CHOICES,
  MIDI_MAX,
  type PianoRoll,
  type RollClip,
  type RollNote,
} from './piano-roll';
import { loopPhase, rescaleStepCount, writeCycles } from '@modules/shared/loop-length';
import { PianoRollToolbar } from './components/PianoRollToolbar';
import { drawRoll, ROLL_HEIGHT, ROW_HEIGHT } from './components/piano-roll-renderer';
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

  const activeRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Span applied to newly added notes — the last committed resize wins.
  const lastSpanRef = useRef(1);

  const setActiveClip = (name: string | null) => {
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

  // Center the vertical scroll around c3 (midi 48) when the clip changes.
  useEffect(() => {
    const wrap = scrollRef.current;
    if (!wrap) return;
    wrap.scrollTop = (MIDI_MAX - 48) * ROW_HEIGHT - wrap.clientHeight / 2;
  }, [active]);

  // The roll as drawn: the drag preview replaces the derived model mid-gesture.
  const displayed = drag ? drag.preview : roll;

  // Mirror for the draw loop (reads outside React's render cycle).
  const viewRef = useRef<{
    roll: PianoRoll | null;
    hover: RollHit | null;
    dragIndex: number | null;
  }>({ roll: null, hover: null, dragIndex: null });
  viewRef.current = { roll: displayed, hover: drag ? null : hover, dragIndex: drag?.index ?? null };

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
            hover: view.hover,
            dragIndex: view.dragIndex,
            playhead,
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

  const emitNote = (type: 'note:created' | 'note:deleted', note: RollNote, total: number) => {
    api.emit(type, {
      note: noteToken(note.midi),
      begin: note.step / total,
      end: (note.step + note.span) / total,
    });
  };

  // ─── Canvas events ──────────────────────────────────────────────────────────

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !roll || drag) return;
    const hit = hitTest(canvas, roll, e.clientX, e.clientY);
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
    const next = addNote(roll, hit.midi, hit.step, lastSpanRef.current);
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
      const cell = cellAt(canvas, roll, e.clientX, e.clientY);
      const preview =
        drag.mode === 'move'
          ? moveNote(roll, drag.index, cell.midi, cell.step - drag.grabStep)
          : resizeNote(roll, drag.index, cell.step - roll.notes[drag.index].step + 1);
      setDrag({ ...drag, preview, moved: true });
      return;
    }
    setHover(hitTest(canvas, roll, e.clientX, e.clientY));
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
            style={{ height: ROLL_HEIGHT, cursor }}
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
