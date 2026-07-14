/**
 * Drum grid rendering — pure drawing over a prepared CanvasSurface
 * (`api.canvas.surface` owns DPR sizing and clearing), driven by the module's
 * rAF loop. FL-style step sequencer: one row per sample, beat blocks of 4
 * steps in alternating shades, sub-hit cells split into vertical bars, and a
 * playhead line while the transport runs.
 */
import type { CanvasSurface } from '@layout/api/PanelCanvasApi';
import type { DrumGrid } from '../drum-grid';

/** Fixed CSS metrics — the DOM row labels align on the same row height. */
export const ROW_HEIGHT = 28;
export const CELL_GAP = 3;

/** Row accents cycled by index (GitHub-dark friendly, like the VU palette). */
const ROW_COLORS = ['#e8925c', '#3fb950', '#58a6ff', '#d29922', '#bc8cff', '#e5484d'];

const BEAT_BG_EVEN = 'rgba(255, 255, 255, 0.055)';
const BEAT_BG_ODD = 'rgba(255, 255, 255, 0.02)';
const CELL_OFF = 'rgba(255, 255, 255, 0.07)';
const HOVER_STROKE = 'rgba(255, 255, 255, 0.55)';
const MEASURE_LINE = 'rgba(255, 255, 255, 0.28)';
const PLAYHEAD = 'rgba(255, 255, 255, 0.8)';

export function rowColor(rowIndex: number): string {
  return ROW_COLORS[rowIndex % ROW_COLORS.length];
}

export interface GridViewState {
  grid: DrumGrid;
  /** Accent color per row, aligned on `grid.rows` (stable across reorders). */
  colors: string[];
  hover: { row: number; step: number } | null;
  /** Cycle phase 0..1, null when the transport is stopped. */
  playhead: number | null;
}

export function drawGrid(surface: CanvasSurface, view: GridViewState): void {
  const { ctx, width, height, dpr } = surface;
  const { grid, colors, hover, playhead } = view;
  if (grid.stepCount === 0) return;

  const cellW = width / grid.stepCount;
  const rowH = ROW_HEIGHT * dpr;
  const gap = CELL_GAP * dpr;

  // Beat blocks: alternate the background every 4 steps, full height.
  for (let i = 0; i < grid.stepCount; i += 4) {
    ctx.fillStyle = (i / 4) % 2 === 0 ? BEAT_BG_EVEN : BEAT_BG_ODD;
    ctx.fillRect(i * cellW, 0, cellW * Math.min(4, grid.stepCount - i), height);
  }

  // Measure boundaries (loop longer than one cycle, `.slow(n)`): a marked
  // vertical line every stepCount / cycles columns.
  const cycles = grid.cycles ?? 1;
  if (cycles > 1 && grid.stepCount % cycles === 0) {
    const perMeasure = grid.stepCount / cycles;
    ctx.fillStyle = MEASURE_LINE;
    for (let m = 1; m < cycles; m++) {
      ctx.fillRect(m * perMeasure * cellW - dpr / 2, 0, dpr, height);
    }
  }

  // Cells.
  for (let r = 0; r < grid.rows.length; r++) {
    const row = grid.rows[r];
    const y = r * rowH + gap;
    const h = rowH - gap * 2;
    for (let i = 0; i < grid.stepCount; i++) {
      const x = i * cellW + gap;
      const w = cellW - gap * 2;
      const count = row.steps[i];
      if (count === 0) {
        ctx.fillStyle = CELL_OFF;
        ctx.fillRect(x, y, w, h);
      } else {
        // n sub-hits = n vertical bars within the cell ([hh hh]).
        ctx.fillStyle = colors[r] ?? rowColor(r);
        const barGap = Math.max(1, Math.round(1.5 * dpr));
        const barW = (w - barGap * (count - 1)) / count;
        for (let b = 0; b < count; b++) {
          ctx.fillRect(x + b * (barW + barGap), y, barW, h);
        }
      }
      if (hover && hover.row === r && hover.step === i) {
        ctx.strokeStyle = HOVER_STROKE;
        ctx.lineWidth = dpr;
        ctx.strokeRect(x + 0.5 * dpr, y + 0.5 * dpr, w - dpr, h - dpr);
      }
    }
  }

  // Playhead: current step tint + position line.
  if (playhead !== null) {
    const step = Math.floor(playhead * grid.stepCount) % grid.stepCount;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(step * cellW, 0, cellW, height);
    ctx.fillStyle = PLAYHEAD;
    ctx.fillRect(playhead * width - dpr / 2, 0, dpr, height);
  }
}
