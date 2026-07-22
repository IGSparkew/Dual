/**
 * Piano roll interactions — pointer position → cell / note, in CSS pixels
 * (the renderer works in device pixels; both derive from the same metrics).
 */
import { type PianoRoll } from '../piano-roll';
import { KEY_GUTTER, ROW_HEIGHT } from './piano-roll-renderer';

/** Max width (CSS px) of the resize zone on a note's right edge. The zone is
 *  capped at a third of the note's width (like the renderer's handle) so a
 *  narrow note stays grabbable for a move. */
export const RESIZE_ZONE = 5;

export interface CellPos {
  midi: number;
  step: number;
}

export type RollHit =
  | { kind: 'note'; index: number; /** true = pointer in the resize zone */ edge: boolean; midi: number; step: number }
  | { kind: 'cell'; midi: number; step: number };

/** The lane cell under the pointer, clamped into the grid (never null once a
 *  drag has captured the pointer). `rows` is the ordered visible-pitch list
 *  (`visibleMidis`) — the row under `y` maps back to its pitch, so folding to a
 *  scale needs no other change here. */
export function cellAt(
  canvas: HTMLCanvasElement,
  roll: PianoRoll,
  rows: number[],
  clientX: number,
  clientY: number,
): CellPos {
  const rect = canvas.getBoundingClientRect();
  const laneW = Math.max(1, rect.width - KEY_GUTTER);
  const x = Math.min(Math.max(clientX - rect.left - KEY_GUTTER, 0), laneW - 1);
  const y = Math.min(Math.max(clientY - rect.top, 0), rect.height - 1);
  const row = Math.min(Math.max(Math.floor(y / ROW_HEIGHT), 0), rows.length - 1);
  const midi = rows[row];
  const step = Math.min(Math.floor((x / laneW) * roll.stepCount), roll.stepCount - 1);
  return { midi, step };
}

/** What the pointer is over: a note (topmost, resize edge flagged) or an empty
 *  cell. null outside the lane area (gutter included). */
export function hitTest(
  canvas: HTMLCanvasElement,
  roll: PianoRoll,
  rows: number[],
  clientX: number,
  clientY: number,
): RollHit | null {
  if (roll.stepCount === 0) return null;
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x < KEY_GUTTER || x >= rect.width || y < 0 || y >= rect.height) return null;

  const { midi, step } = cellAt(canvas, roll, rows, clientX, clientY);
  const cellW = (rect.width - KEY_GUTTER) / roll.stepCount;

  // Topmost note first: the most recently added one wins on overlap.
  for (let i = roll.notes.length - 1; i >= 0; i--) {
    const note = roll.notes[i];
    if (note.midi !== midi || step < note.step || step >= note.step + note.span) continue;
    const rightX = KEY_GUTTER + (note.step + note.span) * cellW;
    const zone = Math.min(RESIZE_ZONE, (note.span * cellW) / 3);
    return { kind: 'note', index: i, edge: rightX - x <= zone, midi, step };
  }
  return { kind: 'cell', midi, step };
}
