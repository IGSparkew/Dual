/**
 * VU meter rendering — pure drawing over a 2D canvas context, driven by the
 * module's single rAF loop. The meter shows pattern *activity* (bucketed hap
 * gains), not a real audio level.
 */

/** Smoothed meter state — instant attack, exponential-ish release. */
export interface VuEnvelope {
  level: number;
}

/** Per-millisecond release rate (level units). ~0.35s from full to silence. */
const RELEASE_PER_MS = 1 / 350;

/** Advance the envelope toward `target` (0..1+) over `dtMs` milliseconds. */
export function stepEnvelope(env: VuEnvelope, target: number, dtMs: number): void {
  if (target >= env.level) {
    env.level = target;
    return;
  }
  env.level = Math.max(target, env.level - RELEASE_PER_MS * dtMs);
}

/** Segment boundaries (fraction of the meter) and their colors. */
const SEGMENTS: Array<{ upTo: number; color: string }> = [
  { upTo: 0.6, color: '#3fb950' },
  { upTo: 0.85, color: '#d29922' },
  { upTo: 1, color: '#e5484d' },
];

/**
 * Draw the meter into `canvas`, resizing its backing store to the element's
 * CSS size × devicePixelRatio when needed. `level` is clamped to 0..1.
 */
export function drawVuMeter(canvas: HTMLCanvasElement, level: number): void {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, w, h);
  const value = Math.min(1, Math.max(0, level));

  let from = 0;
  for (const seg of SEGMENTS) {
    const to = Math.min(value, seg.upTo);
    if (to <= from) break;
    ctx.fillStyle = seg.color;
    // Meter fills bottom-up: fraction f maps to y = h * (1 - f).
    ctx.fillRect(0, h * (1 - to), w, h * (to - from));
    from = to;
  }
}
