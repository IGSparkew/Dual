/**
 * Drum grid interactions — pointer position → cell, in CSS pixels (the
 * renderer works in device pixels; both derive from the same metrics).
 */
import type { DrumGrid } from '../drum-grid';
import { ROW_HEIGHT } from './grid-renderer';

export interface CellHit {
  row: number;
  step: number;
}

export function hitTest(
  canvas: HTMLCanvasElement,
  grid: DrumGrid,
  clientX: number,
  clientY: number,
): CellHit | null {
  if (grid.stepCount === 0 || grid.rows.length === 0) return null;
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x < 0 || y < 0 || x >= rect.width) return null;

  const row = Math.floor(y / ROW_HEIGHT);
  const step = Math.floor((x / rect.width) * grid.stepCount);
  if (row < 0 || row >= grid.rows.length || step < 0 || step >= grid.stepCount) return null;
  return { row, step };
}
