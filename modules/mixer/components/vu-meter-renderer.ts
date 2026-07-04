/**
 * VU meter rendering — pure drawing over a 2D canvas context, driven by the
 * module's single rAF loop. The meter shows pattern *activity* (bucketed hap
 * gains), not a real audio level.
 *
 * Motion model: the activity buckets carry an onset spike at each note start
 * and a lower sustain body for the rest of the duration (see deriveActivity).
 * The envelope simply tracks that target — fast smoothed attack, slower
 * exponential release — so the bar jumps on hits and settles in between
 * instead of re-triggering on every bucket. A peak-hold marker rides on top.
 */

/** Smoothed meter state — fast attack, exponential release. */
export interface VuEnvelope {
  level: number;
  /** Peak-hold level and how long it has been held (ms). */
  peak: number;
  peakAgeMs: number;
}

export function createEnvelope(): VuEnvelope {
  return { level: 0, peak: 0, peakAgeMs: 0 };
}

/** Attack smoothing — the bar covers ~63% of a rise every 25ms. */
const ATTACK_TAU_MS = 25;
/** Release time constant — the bar loses ~63% of its level every 250ms. */
const RELEASE_TAU_MS = 250;
/** Peak marker: hold duration, then linear fall rate (level units per ms). */
const PEAK_HOLD_MS = 500;
const PEAK_FALL_PER_MS = 1 / 600;

/** Advance the envelope toward `target` (0..1+) over `dtMs` milliseconds. */
export function stepEnvelope(env: VuEnvelope, target: number, dtMs: number): void {
  const clamped = Math.min(1, Math.max(0, target));
  if (clamped > env.level) {
    env.level += (clamped - env.level) * (1 - Math.exp(-dtMs / ATTACK_TAU_MS));
  } else {
    env.level *= Math.exp(-dtMs / RELEASE_TAU_MS);
    if (env.level < clamped) env.level = clamped;
    if (env.level < 0.001) env.level = 0;
  }

  if (env.level >= env.peak) {
    env.peak = env.level;
    env.peakAgeMs = 0;
  } else {
    env.peakAgeMs += dtMs;
    if (env.peakAgeMs > PEAK_HOLD_MS) {
      env.peak = Math.max(env.level, env.peak - PEAK_FALL_PER_MS * dtMs);
    }
  }
}

/** Segment boundaries (fraction of the meter) and their colors. */
const SEGMENTS: Array<{ upTo: number; color: string }> = [
  { upTo: 0.6, color: '#3fb950' },
  { upTo: 0.85, color: '#d29922' },
  { upTo: 1, color: '#e5484d' },
];

function zoneColor(fraction: number): string {
  for (const seg of SEGMENTS) {
    if (fraction <= seg.upTo) return seg.color;
  }
  return SEGMENTS[SEGMENTS.length - 1].color;
}

/**
 * Draw the meter into `canvas` as a bottom-up LED ladder, resizing its backing
 * store to the element's CSS size × devicePixelRatio when needed. Unlit LEDs
 * stay faintly visible; the peak-hold LED is drawn lit even above the level.
 */
export function drawVuMeter(canvas: HTMLCanvasElement, env: VuEnvelope): void {
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

  const gap = Math.max(1, Math.round(1.5 * dpr));
  const block = Math.max(2, Math.round(3 * dpr));
  const step = block + gap;
  const count = Math.max(1, Math.floor((h + gap) / step));

  const level = Math.min(1, Math.max(0, env.level));
  const litCount = Math.round(level * count);
  const peakIndex = Math.min(count - 1, Math.ceil(env.peak * count) - 1);

  for (let i = 0; i < count; i++) {
    const y = h - (i + 1) * step + gap;
    const color = zoneColor((i + 0.5) / count);
    const lit = i < litCount || i === peakIndex;
    ctx.globalAlpha = lit ? 1 : 0.14;
    ctx.fillStyle = color;
    ctx.fillRect(0, y, w, block);
  }
  ctx.globalAlpha = 1;
}
