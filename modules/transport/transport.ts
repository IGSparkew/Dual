import type { PanelCodeApi } from '@layout/api/PanelApi';

/**
 * Transport — pure logic (code ↔ tempo), no React, no store.
 *
 * The document is the single source of truth for tempo too: the BPM lives as a
 * leading `setcps(cps)` call at the top of the document, so it survives Save and
 * the strudel.cc share link. Strudel counts in cycles per second, with one cycle
 * spanning four beats — the same conversion the Scheduler applies to the live
 * repl (`setCps(bpm / 60 / 4)`).
 */

/** Name of the top-level tempo call Strudel understands. */
const CPS_CALLEE = 'setcps';

/** One cycle = four beats (Strudel convention). */
const BEATS_PER_CYCLE = 4;

/** cps (cycles per second) for a BPM. */
export function bpmToCps(bpm: number): number {
  return bpm / 60 / BEATS_PER_CYCLE;
}

/** BPM for a cps value. */
export function cpsToBpm(cps: number): number {
  return cps * 60 * BEATS_PER_CYCLE;
}

/** Render a cps value without floating-point noise (`0.4999999…`) — trims to a
 *  stable decimal so repeated writes stay byte-identical for the same BPM. */
function formatCps(cps: number): string {
  return String(Number(cps.toFixed(6)));
}

/**
 * Write (or refresh in place) the leading `setcps(cps)` call for `bpm`. Pure
 * code → code: delegates the splice/insert to the CodeRegion verb, never
 * touching the document text directly.
 */
export function writeBpm(code: PanelCodeApi, source: string, bpm: number): string {
  return code.setLeadingCall(source, CPS_CALLEE, formatCps(bpmToCps(bpm)));
}

/**
 * BPM projected by a leading `setcps(x)` call, or null when the document has no
 * such call or its first argument is not a positive number (e.g. an expression
 * the slider cannot represent). Rounded to an integer to match the slider step.
 */
export function readBpm(code: PanelCodeApi, source: string): number | null {
  const args = code.leadingCallArgs(source, CPS_CALLEE);
  if (!args || args.length === 0) return null;
  const cps = Number(args[0].source);
  if (!Number.isFinite(cps) || cps <= 0) return null;
  return Math.round(cpsToBpm(cps));
}
