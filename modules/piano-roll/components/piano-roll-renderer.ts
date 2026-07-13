/**
 * Piano roll rendering — pure drawing over a prepared CanvasSurface
 * (`api.canvas.surface` owns DPR sizing and clearing), driven by the module's
 * rAF loop. Piano key gutter on the left, one lane per semitone (black-key
 * lanes tinted), step grid with a beat accent every 4 steps, rounded note
 * rectangles with a resize handle, and a playhead line while playing.
 */
import type { CanvasSurface } from '@layout/api/PanelCanvasApi';
import { MIDI_MAX, MIDI_MIN, noteToken, type PianoRoll } from '../piano-roll';
import type { RollHit } from './note-interaction';

/** Fixed CSS metrics — hit testing derives cells from the same numbers. */
export const ROW_HEIGHT = 14;
export const KEY_GUTTER = 48;
/** Full canvas CSS height — the wrapper scrolls it vertically. */
export const ROLL_HEIGHT = (MIDI_MAX - MIDI_MIN + 1) * ROW_HEIGHT;

/** Note accent — same family as the drum grid row palette. */
const NOTE_FILL = '#58a6ff';
const NOTE_HANDLE = 'rgba(255, 255, 255, 0.45)';
const NOTE_STROKE = 'rgba(255, 255, 255, 0.85)';

const LANE_BLACK = 'rgba(255, 255, 255, 0.045)';
const LINE_SEMITONE = 'rgba(255, 255, 255, 0.05)';
const LINE_OCTAVE = 'rgba(255, 255, 255, 0.16)';
const LINE_STEP = 'rgba(255, 255, 255, 0.05)';
const LINE_BEAT = 'rgba(255, 255, 255, 0.14)';
const HOVER_CELL = 'rgba(255, 255, 255, 0.08)';
const PLAYHEAD = 'rgba(255, 255, 255, 0.8)';

const KEY_WHITE = 'rgba(255, 255, 255, 0.72)';
const KEY_BLACK = 'rgba(0, 0, 0, 0.55)';
const KEY_LABEL = 'rgba(0, 0, 0, 0.8)';

const BLACK_CHROMAS = new Set([1, 3, 6, 8, 10]);

export function isBlackKey(midi: number): boolean {
  return BLACK_CHROMAS.has(((midi % 12) + 12) % 12);
}

export interface RollViewState {
  /** The roll as drawn — the module substitutes the drag preview here. */
  roll: PianoRoll;
  hover: RollHit | null;
  /** Note being dragged (index into `roll.notes`), highlighted. */
  dragIndex: number | null;
  /** Cycle phase 0..1, null when the transport is stopped. */
  playhead: number | null;
}

export function drawRoll(surface: CanvasSurface, view: RollViewState): void {
  const { ctx, width, height, dpr } = surface;
  const { roll, hover, dragIndex, playhead } = view;
  if (roll.stepCount === 0) return;

  const rowH = ROW_HEIGHT * dpr;
  const gutter = KEY_GUTTER * dpr;
  const laneW = width - gutter;
  const cellW = laneW / roll.stepCount;
  const rowY = (midi: number) => (MIDI_MAX - midi) * rowH;

  // Lanes: tint the black-key rows, thin line per semitone, octave accents.
  for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi++) {
    const y = rowY(midi);
    if (isBlackKey(midi)) {
      ctx.fillStyle = LANE_BLACK;
      ctx.fillRect(gutter, y, laneW, rowH);
    }
    ctx.fillStyle = midi % 12 === 0 ? LINE_OCTAVE : LINE_SEMITONE;
    ctx.fillRect(gutter, y + rowH - dpr / 2, laneW, dpr);
  }

  // Step grid: vertical lines, accent every 4 steps.
  for (let i = 0; i <= roll.stepCount; i++) {
    ctx.fillStyle = i % 4 === 0 ? LINE_BEAT : LINE_STEP;
    ctx.fillRect(gutter + i * cellW - dpr / 2, 0, dpr, height);
  }

  // Hovered empty cell.
  if (hover && hover.kind === 'cell') {
    ctx.fillStyle = HOVER_CELL;
    ctx.fillRect(gutter + hover.step * cellW, rowY(hover.midi), cellW, rowH);
  }

  // Notes: rounded rects with a resize handle band on the right edge.
  const pad = dpr;
  for (let i = 0; i < roll.notes.length; i++) {
    const note = roll.notes[i];
    if (note.midi < MIDI_MIN || note.midi > MIDI_MAX) continue;
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
  for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi++) {
    const y = rowY(midi);
    if (isBlackKey(midi)) {
      // Short black key over the left 60% of the gutter.
      ctx.fillStyle = KEY_BLACK;
      ctx.fillRect(0, y + dpr, gutter * 0.6, rowH - 2 * dpr);
    } else if (midi % 12 === 0) {
      // Label the Cs (`c1` … `c7`).
      ctx.fillStyle = KEY_LABEL;
      ctx.fillText(noteToken(midi), gutter * 0.62, y + rowH / 2);
    }
    // Key separator on B/C and E/F boundaries (no black key between).
    const chroma = ((midi % 12) + 12) % 12;
    if (chroma === 0 || chroma === 5) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(0, y + rowH - dpr / 2, gutter, dpr);
    }
  }
}
