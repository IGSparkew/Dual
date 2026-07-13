/**
 * Loop length helpers shared by the pattern-editing modules (drum grid,
 * piano roll). Pure functions over source text and the CodeRegion façade —
 * no React, no store, no module vocabulary.
 *
 * A Strudel pattern always fits one cycle: growing the step count of an
 * `s("...")` / `note("...")` makes it play faster instead of longer. A loop
 * of n measures is expressed by chaining `.slow(n)` on the clip's
 * initializer — `const A = stack(s("…")).slow(2)`. These helpers own that
 * single managed link; anything richer (several `.slow` links, a non-literal
 * argument like `.slow(sine)`, a decimal factor) is unmanaged: reads return
 * null and writes are no-ops — same hands-off policy as a "complex" clip.
 */
import type { PanelCodeApi } from '@layout/api/PanelApi';

/** Loop lengths (in cycles) offered by the « Mesures » selects. */
export const CYCLE_CHOICES: readonly number[] = [1, 2, 4, 8];

/**
 * Beats per cycle. The transport position is in beats and the scheduler maps
 * one cycle to four beats (`setCps(bpm / 60 / 4)` in SchedulerImpl) — keep in
 * sync with that convention.
 */
const BEATS_PER_CYCLE = 4;

/**
 * Playhead phase inside an n-cycle loop, in [0, 1). `positionBeats` is the
 * transport position in beats; it can be slightly negative right after start
 * (cycle-clock jitter), hence the double modulo keeping the result in [0, 1).
 */
export function loopPhase(positionBeats: number, cycles: number): number {
  return (((positionBeats / BEATS_PER_CYCLE / cycles) % 1) + 1) % 1;
}

/**
 * Re-scale a clip's total step count from a `from`-cycle loop to a `to`-cycle
 * loop, keeping the per-step duration constant (16 steps over 1 cycle → 32
 * steps over 2). When the count does not divide evenly by `from`, the content
 * is left alone (only the `.slow` factor moves): the count comes back
 * unchanged.
 */
export function rescaleStepCount(stepCount: number, from: number, to: number): number {
  return stepCount % from === 0 ? (stepCount / from) * to : stepCount;
}

/**
 * The clip's loop length in cycles, read from its chained `.slow(n)`.
 * No `slow` link → 1. Exactly one link with a single integer literal ≥ 1 →
 * that value. Anything else (several links, non-literal or decimal argument,
 * missing declaration) → null = unmanaged.
 */
export function readCycles(api: PanelCodeApi, code: string, name: string): number | null {
  const links = api.chainCalls(code, name);
  if (links === null) return null;
  const slows = links.filter((link) => link.method === 'slow');
  if (slows.length === 0) return 1;
  if (slows.length > 1) return null;
  const args = slows[0].args;
  if (args.length !== 1 || args[0].isIdentifier) return null;
  const value = Number(args[0].source.trim());
  if (!Number.isInteger(value) || value < 1) return null;
  return value;
}

/**
 * Write the clip's loop length: splice the existing `.slow(n)` argument in
 * place, append `.slow(n)` at the end of the initializer when absent (same
 * spot as the FX rack and the drum grid's `.bank(...)`), or remove the whole
 * link when `cycles` is 1. No-op when the current state is unmanaged
 * (`readCycles` → null) — the Code Editor owns it.
 *
 * Note: `.slow(n)` appended at the END of the chain stretches everything
 * before it, including the patterned arguments of chained FX (e.g.
 * `.lpf("400 800")` then sweeps over n measures instead of one). This is the
 * intended semantics — the clip as a whole loops over n measures.
 */
export function writeCycles(
  api: PanelCodeApi,
  code: string,
  name: string,
  cycles: number,
): string {
  const current = readCycles(api, code, name);
  if (current === null || cycles === current) return code;

  const link = (api.chainCalls(code, name) ?? []).find((l) => l.method === 'slow');
  if (cycles <= 1) {
    // Back to one cycle: a clean splice of the whole managed link.
    return link ? api.spliceSpan(code, link.start, link.end, '') : code;
  }
  if (link) {
    return api.spliceSpan(code, link.args[0].start, link.args[0].end, String(cycles));
  }
  const def = (api.list(code) ?? []).find((d) => d.name === name);
  if (!def || def.initKind !== 'pattern') return code;
  return api.spliceSpan(code, def.initEnd, def.initEnd, `.slow(${cycles})`);
}
