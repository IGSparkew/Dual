/**
 * Piano roll rendering — pure drawing over a prepared CanvasSurface
 * (`api.canvas.surface` owns DPR sizing and clearing), driven by the module's
 * rAF loop. Piano key gutter on the left, one lane per visible pitch row
 * (black-key lanes tinted), step grid with a beat accent every 4 steps, rounded
 * note rectangles with a resize handle, and a playhead line while playing.
 *
 * Rows are not a fixed semitone range: `visibleMidis` produces the ordered list
 * of displayed pitches — every semitone normally, or (folded to a locked scale)
 * only the scale's own tones, Ableton-style. The renderer and the interaction
 * layer both derive their midi↔row mapping from that same list.
 */
import type { CanvasSurface } from '@layout/api/PanelCanvasApi';
import { isInScale, MIDI_MAX, MIDI_MIN, noteToken, type PianoRoll, type ScaleSpec } from '../piano-roll';
import type { RollHit } from './note-interaction';

/** Fixed CSS metrics — hit testing derives cells from the same numbers. */
export const ROW_HEIGHT = 14;
export const KEY_GUTTER = 48;
/** Full canvas CSS height when every semitone is shown (no scale fold). The
 *  module recomputes the actual height from the visible row count. */
export const ROLL_HEIGHT = (MIDI_MAX - MIDI_MIN + 1) * ROW_HEIGHT;

/** Ordered top-to-bottom list of the pitch rows to display: every semitone in
 *  range, or — when folded to a scale — only its in-scale pitches. Descending
 *  (index 0 = highest pitch, smallest y), matching the renderer's row layout
 *  and `cellAt`. `scale === null` = no fold, all semitones. */
export function visibleMidis(scale: ScaleSpec | null): number[] {
  const rows: number[] = [];
  for (let midi = MIDI_MAX; midi >= MIDI_MIN; midi--) {
    if (scale === null || isInScale(midi, scale)) rows.push(midi);
  }
  return rows;
}

/** Note accent — same family as the drum grid row palette. */
const NOTE_FILL = '#58a6ff';
const NOTE_HANDLE = 'rgba(255, 255, 255, 0.45)';
const NOTE_STROKE = 'rgba(255, 255, 255, 0.85)';

const LANE_BLACK = 'rgba(255, 255, 255, 0.045)';
const LINE_SEMITONE = 'rgba(255, 255, 255, 0.05)';
const LINE_OCTAVE = 'rgba(255, 255, 255, 0.16)';
const LINE_STEP = 'rgba(255, 255, 255, 0.05)';
const LINE_BEAT = 'rgba(255, 255, 255, 0.14)';
const LINE_MEASURE = 'rgba(255, 255, 255, 0.3)';
const HOVER_CELL = 'rgba(255, 255, 255, 0.08)';
const PLAYHEAD = 'rgba(255, 255, 255, 0.8)';
/** Overlaid on top of the lane/gutter tint for pitches outside the visual-aid
 *  scale (see `RollViewState.scale`) — purely visual, never affects the code.
 *  Deep enough to clearly recede against the already-dark background and the
 *  black-key lane tint, so the scale reads at a glance. Only in the unfolded
 *  view — folded rows are all in scale, so nothing to dim. */
const OUT_OF_SCALE = 'rgba(0, 0, 0, 0.55)';
/** Overlaid on top of the lane/gutter tint for the scale's root (degree 0,
 *  repeated every octave) — same family as `NOTE_FILL`, mutually exclusive
 *  with `OUT_OF_SCALE`. Purely visual, never affects the code. */
const SCALE_ROOT = 'rgba(88, 167, 255, 0.34)';
/** Overlaid on top of the lane/gutter tint for the scale's other tones (in
 *  scale, not the root) — same family as `SCALE_ROOT` but more discreet,
 *  mutually exclusive with both `OUT_OF_SCALE` and `SCALE_ROOT`. Purely
 *  visual, never affects the code. Suppressed in the folded view, where every
 *  row is already a scale tone and tinting them all would just add noise. */
const SCALE_TONE = 'rgba(88, 167, 255, 0.18)';

const KEY_WHITE = 'rgba(255, 255, 255, 0.72)';
const KEY_BLACK = 'rgba(0, 0, 0, 0.55)';
const KEY_LABEL = 'rgba(0, 0, 0, 0.8)';

const BLACK_CHROMAS = new Set([1, 3, 6, 8, 10]);

export function isBlackKey(midi: number): boolean {
  return BLACK_CHROMAS.has(((midi % 12) + 12) % 12);
}

/** True when `midi` is the scale's root (degree 0), repeated every octave. */
function isScaleRoot(midi: number, scale: ScaleSpec): boolean {
  return ((midi % 12) + 12) % 12 === scale.rootChroma;
}

/** Scale tint for a row, or null (no overlay). In the folded view only the
 *  root is tinted (every other row is already an in-scale tone); unfolded, the
 *  out-of-scale rows are dimmed and the in-scale tones lightly tinted. */
function scaleTint(midi: number, scale: ScaleSpec, folded: boolean): string | null {
  if (isScaleRoot(midi, scale)) return SCALE_ROOT;
  if (!isInScale(midi, scale)) return folded ? null : OUT_OF_SCALE;
  return folded ? null : SCALE_TONE;
}

export interface RollViewState {
  /** The roll as drawn — the module substitutes the drag preview here. */
  roll: PianoRoll;
  /** Ordered visible pitch rows (top→bottom), from `visibleMidis`. Both the
   *  layout and the hit test share this list. */
  rows: number[];
  hover: RollHit | null;
  /** Note being dragged (index into `roll.notes`), highlighted. */
  dragIndex: number | null;
  /** Cycle phase 0..1, null when the transport is stopped. */
  playhead: number | null;
  /** Visual-aid scale (toolbar root + type, independent from `roll.scaleState`
   *  — see PianoRollModule's `effectiveScale`) highlighting/dimming rows; null
   *  when no root is picked. Purely cosmetic, never affects the code. */
  scale: ScaleSpec | null;
  /** Whether `rows` is folded to the scale's tones — changes how `scale` is
   *  rendered (root only, no dimming). */
  folded: boolean;
  /** Label every key in the gutter with its note name (not just the Cs). */
  showNoteNames: boolean;
}

export function drawRoll(surface: CanvasSurface, view: RollViewState): void {
  const { ctx, width, height, dpr } = surface;
  const { roll, rows, hover, dragIndex, playhead, scale, folded, showNoteNames } = view;
  if (roll.stepCount === 0 || rows.length === 0) return;

  const rowH = ROW_HEIGHT * dpr;
  const gutter = KEY_GUTTER * dpr;
  const laneW = width - gutter;
  const cellW = laneW / roll.stepCount;

  // Row index (from the top) for a pitch — the single source of vertical
  // geometry, shared with `cellAt`. undefined when the pitch is not displayed.
  const rowOf = new Map<number, number>();
  rows.forEach((midi, i) => rowOf.set(midi, i));
  const rowY = (midi: number) => (rowOf.get(midi) ?? 0) * rowH;

  // Lanes: tint the black-key rows, thin line per semitone, octave accents,
  // and (when a scale is picked) highlight/dim rows.
  for (let r = 0; r < rows.length; r++) {
    const midi = rows[r];
    const y = r * rowH;
    if (isBlackKey(midi)) {
      ctx.fillStyle = LANE_BLACK;
      ctx.fillRect(gutter, y, laneW, rowH);
    }
    if (scale !== null) {
      const tint = scaleTint(midi, scale, folded);
      if (tint !== null) {
        ctx.fillStyle = tint;
        ctx.fillRect(gutter, y, laneW, rowH);
      }
    }
    ctx.fillStyle = midi % 12 === 0 ? LINE_OCTAVE : LINE_SEMITONE;
    ctx.fillRect(gutter, y + rowH - dpr / 2, laneW, dpr);
  }

  // Step grid: vertical lines, accent every 4 steps, and a stronger measure
  // line every stepCount / cycles columns when the loop spans several cycles.
  const cycles = roll.cycles ?? 1;
  const perMeasure =
    cycles > 1 && roll.stepCount % cycles === 0 ? roll.stepCount / cycles : 0;
  for (let i = 0; i <= roll.stepCount; i++) {
    const onMeasure = perMeasure > 0 && i % perMeasure === 0;
    ctx.fillStyle = onMeasure ? LINE_MEASURE : i % 4 === 0 ? LINE_BEAT : LINE_STEP;
    ctx.fillRect(gutter + i * cellW - dpr / 2, 0, dpr, height);
  }

  // Hovered empty cell.
  if (hover && hover.kind === 'cell' && rowOf.has(hover.midi)) {
    ctx.fillStyle = HOVER_CELL;
    ctx.fillRect(gutter + hover.step * cellW, rowY(hover.midi), cellW, rowH);
  }

  // Notes: rounded rects with a resize handle band on the right edge.
  const pad = dpr;
  for (let i = 0; i < roll.notes.length; i++) {
    const note = roll.notes[i];
    if (!rowOf.has(note.midi)) continue; // outside the visible rows (folded)
    const x = gutter + note.step * cellW + pad;
    const y = rowY(note.midi) + pad;
    const w = note.span * cellW - pad * 2;
    const h = rowH - pad * 2;
    ctx.fillStyle = NOTE_FILL;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 2 * dpr);
    ctx.fill();
    // Resize handle.
    const handleW = Math.min(3 * dpr, w / 3);
    ctx.fillStyle = NOTE_HANDLE;
    ctx.fillRect(x + w - handleW, y, handleW, h);
    // Hover / drag outline.
    const outlined = dragIndex === i || (hover?.kind === 'note' && hover.index === i);
    if (outlined) {
      ctx.strokeStyle = NOTE_STROKE;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.roundRect(x + dpr / 2, y + dpr / 2, w - dpr, h - dpr, 2 * dpr);
      ctx.stroke();
    }
  }

  // Playhead: position line across the lane area.
  if (playhead !== null) {
    ctx.fillStyle = PLAYHEAD;
    ctx.fillRect(gutter + playhead * laneW - dpr / 2, 0, dpr, height);
  }

  // Piano gutter (drawn last so notes never bleed over it).
  ctx.fillStyle = KEY_WHITE;
  ctx.fillRect(0, 0, gutter, height);
  ctx.font = `${9 * dpr}px sans-serif`;
  ctx.textBaseline = 'middle';
  for (let r = 0; r < rows.length; r++) {
    const midi = rows[r];
    const y = r * rowH;
    if (isBlackKey(midi)) {
      // Short black key over the left 60% of the gutter.
      ctx.fillStyle = KEY_BLACK;
      ctx.fillRect(0, y + dpr, gutter * 0.6, rowH - 2 * dpr);
    }
    // Label the Cs (`c1` … `c7`), or every row when "note names" is on. Black
    // keys land in the white strip right of their short key, still readable.
    if (showNoteNames || midi % 12 === 0) {
      ctx.fillStyle = KEY_LABEL;
      ctx.fillText(noteToken(midi), gutter * 0.62, y + rowH / 2);
    }
    if (scale !== null) {
      const tint = scaleTint(midi, scale, folded);
      if (tint !== null) {
        ctx.fillStyle = tint;
        ctx.fillRect(0, y, gutter, rowH);
      }
    }
    // Key separator on B/C and E/F boundaries (no black key between).
    const chroma = ((midi % 12) + 12) % 12;
    if (chroma === 0 || chroma === 5) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(0, y + rowH - dpr / 2, gutter, dpr);
    }
  }
}
