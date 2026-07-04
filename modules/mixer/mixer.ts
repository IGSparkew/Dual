/**
 * Mixer model — pure helpers over the CodeRegion façade.
 *
 * A channel strip is a named clip `const`; the mixer owns three facets of it:
 * its gate (`NAME_ON`, mute), its fader (`NAME_GAIN`) and its panner
 * (`NAME_PAN`), all plain value consts spliced in place. It never owns the
 * clip's content, the `$:` projection or the document.
 *
 * All reads slice exact source via the façade; all writes go through the
 * façade's structure-preserving transforms (offsets re-resolved from the
 * current text on every operation).
 */
import type { PanelCodeApi } from '@layout/api/PanelApi';
import type { Decl } from '@core/interpreter/CodeRegion';
import type { NormalizedHap } from '@core/types/hap';

// ─── Naming convention (clip ↔ its config consts) ────────────────────────────
// Mirrors the session module's convention — the two modules agree on the same
// document-level contract without sharing code (modules stay independent).

export function gateName(clip: string): string {
  return `${clip.toUpperCase()}_ON`;
}

export function gainName(clip: string): string {
  return `${clip.toUpperCase()}_GAIN`;
}

export function panName(clip: string): string {
  return `${clip.toUpperCase()}_PAN`;
}

// ─── Model (derived view) ────────────────────────────────────────────────────

/** A channel strip as the mixer sees it, derived from the document. */
export interface Strip {
  /** Const identifier — immutable identity, shared with the session grid. */
  name: string;
  /** True when the stack arguments are identifiers (a composition). */
  isGroup: boolean;
  /** Names referenced by the initializer (group members). */
  refs: string[];
  /** True when a `NAME_ON` gate const exists. */
  hasGate: boolean;
  /** Gate state: `NAME_ON === 0`. */
  isMuted: boolean;
  /** Literal value of `NAME_GAIN`; null when the const is absent (unmanaged). */
  gain: number | null;
  /** Literal value of `NAME_PAN`; null when the const is absent (unmanaged). */
  pan: number | null;
  /** Declaration offsets — used to attribute haps to strips (VU meters). */
  start: number;
  end: number;
}

/** Default values written on first touch, and UI ranges. */
export const GAIN_DEFAULT = 1; // range 0..2, linear
export const PAN_DEFAULT = 0.5; // Strudel-native 0..1 (0.5 = center)

/** Read a config const's numeric literal (null when absent or not a number). */
function readNum(byName: Map<string, Decl>, name: string): number | null {
  const def = byName.get(name);
  if (!def || def.initKind !== 'value') return null;
  const value = Number(def.source.trim());
  return Number.isFinite(value) ? value : null;
}

// ─── Derivation (code → model) ───────────────────────────────────────────────

export function deriveStrips(api: PanelCodeApi, defs: Decl[]): Strip[] {
  const byName = new Map(defs.map((d) => [d.name, d]));
  const strips: Strip[] = [];

  for (const def of defs) {
    // A strip is a `const` whose initializer is a call — same filter as the
    // session grid, so both views always show the same clips.
    if (def.declKind !== 'const' || def.initKind !== 'pattern') continue;
    const q = api.readExpr(def.source);
    if (q === null || !q.isCall()) continue;
    const gate = byName.get(gateName(def.name));
    strips.push({
      name: def.name,
      isGroup: def.refs.length > 0,
      refs: def.refs,
      hasGate: gate !== undefined,
      isMuted: gate !== undefined && gate.source.trim() === '0',
      gain: readNum(byName, gainName(def.name)),
      pan: readNum(byName, panName(def.name)),
      start: def.start,
      end: def.end,
    });
  }
  return strips;
}

// ─── Serialization ───────────────────────────────────────────────────────────

/** Serialize a fader/pan value as a stable literal (2 decimals max). */
export function formatNum(v: number): string {
  return String(Math.round(v * 100) / 100);
}

// ─── Splices (all re-resolve offsets from the passed `code`) ─────────────────

/**
 * Provision the fader machinery on a clip that lacks it: append
 * `.gain(NAME_ON ? NAME_GAIN : 0)` to its initializer and insert the consts
 * just above it. Created ON (the user is dragging a fader, not muting).
 */
export function provisionFader(
  api: PanelCodeApi,
  code: string,
  def: Decl,
  gain: number,
): string {
  const on = gateName(def.name);
  const gainC = gainName(def.name);
  const next = api.spliceSpan(code, def.initEnd, def.initEnd, `.gain(${on} ? ${gainC} : 0)`);
  const def2 = (api.list(next) ?? []).find((d) => d.name === def.name);
  if (!def2) return next;
  return api.spliceSpan(
    next,
    def2.start,
    def2.start,
    `const ${gainC} = ${formatNum(gain)};\nconst ${on} = 1;\n`,
  );
}

/**
 * Provision the pan machinery on a clip that lacks it: append `.pan(NAME_PAN)`
 * to its initializer and insert the const just above it (lazy — the const only
 * appears once the user touches the knob).
 */
export function provisionPan(
  api: PanelCodeApi,
  code: string,
  def: Decl,
  pan: number,
): string {
  const panC = panName(def.name);
  const next = api.spliceSpan(code, def.initEnd, def.initEnd, `.pan(${panC})`);
  const def2 = (api.list(next) ?? []).find((d) => d.name === def.name);
  if (!def2) return next;
  return api.spliceSpan(next, def2.start, def2.start, `const ${panC} = ${formatNum(pan)};\n`);
}

/** Set a strip's gain: value flip when managed, full provision otherwise. */
export function setGain(
  api: PanelCodeApi,
  code: string,
  strip: Strip,
  value: number,
): string {
  if (strip.gain !== null) return api.setInit(code, gainName(strip.name), formatNum(value));
  const def = (api.list(code) ?? []).find((d) => d.name === strip.name);
  if (!def) return code;
  return provisionFader(api, code, def, value);
}

/** Set a strip's pan: value flip when managed, lazy provision otherwise. */
export function setPan(
  api: PanelCodeApi,
  code: string,
  strip: Strip,
  value: number,
): string {
  if (strip.pan !== null) return api.setInit(code, panName(strip.name), formatNum(value));
  const def = (api.list(code) ?? []).find((d) => d.name === strip.name);
  if (!def) return code;
  return provisionPan(api, code, def, value);
}

/**
 * Provision the gate machinery muted (`NAME_ON = 0`) — the user just asked to
 * mute a hand-written clip. Mirrors the session module's provisionGate.
 */
function provisionMute(api: PanelCodeApi, code: string, def: Decl): string {
  const on = gateName(def.name);
  const gain = gainName(def.name);
  const next = api.spliceSpan(code, def.initEnd, def.initEnd, `.gain(${on} ? ${gain} : 0)`);
  const def2 = (api.list(next) ?? []).find((d) => d.name === def.name);
  if (!def2) return next;
  return api.spliceSpan(next, def2.start, def2.start, `const ${gain} = 1;\nconst ${on} = 0;\n`);
}

/** Toggle a strip's mute: gate flip when managed, muted provision otherwise. */
export function toggleMute(api: PanelCodeApi, code: string, strip: Strip): string {
  if (strip.hasGate) {
    return api.setInit(code, gateName(strip.name), strip.isMuted ? '1' : '0');
  }
  const def = (api.list(code) ?? []).find((d) => d.name === strip.name);
  if (!def) return code;
  return provisionMute(api, code, def);
}

// ─── Solo (one chained transform → one write) ────────────────────────────────

/** Gate states before solo, keyed by strip name (true = was ON). */
export type PreSolo = Record<string, boolean>;

/**
 * Mute every strip outside the solo set (provisioning gates where needed) and
 * unmute the soloed ones. Returns the new code and the pre-solo snapshot so
 * `releaseSolo` can restore the exact previous states.
 */
export function engageSolo(
  api: PanelCodeApi,
  code: string,
  strips: Strip[],
  solo: Set<string>,
): { code: string; preSolo: PreSolo } {
  const preSolo: PreSolo = {};
  let next = code;

  for (const strip of strips) {
    preSolo[strip.name] = !strip.isMuted;
    const desiredOn = solo.has(strip.name);
    const currentOn = !strip.isMuted;
    if (desiredOn === currentOn) continue;
    if (strip.hasGate) {
      next = api.setInit(next, gateName(strip.name), desiredOn ? '1' : '0');
    } else if (!desiredOn) {
      // No gate yet and it must go silent: provision it muted.
      const def = (api.list(next) ?? []).find((d) => d.name === strip.name);
      if (def) next = provisionMute(api, next, def);
    }
  }
  return { code: next, preSolo };
}

/**
 * Restore the gates captured before solo. Strips deleted or de-gated in the
 * meantime are skipped (the document is the truth, never repaired).
 */
export function releaseSolo(
  api: PanelCodeApi,
  code: string,
  strips: Strip[],
  preSolo: PreSolo,
): string {
  let next = code;
  for (const strip of strips) {
    const wasOn = preSolo[strip.name];
    if (wasOn === undefined || !strip.hasGate) continue;
    if (wasOn !== !strip.isMuted) {
      next = api.setInit(next, gateName(strip.name), wasOn ? '1' : '0');
    }
  }
  return next;
}

// ─── VU activity (haps → per-strip cycle buckets) ────────────────────────────

/** Per-strip activity envelope over one cycle (values 0..n, usually 0..1). */
export type Activity = Record<string, number[]>;

/**
 * Bucket the evaluated haps per strip over one cycle. A hap belongs to the
 * strip whose declaration span contains its first source location; a group
 * additionally inherits the activity of its transitive members. This is an
 * *activity* approximation (pattern structure), not a real audio level.
 */
export function deriveActivity(
  haps: NormalizedHap[],
  strips: Strip[],
  buckets = 16,
): Activity {
  const activity: Activity = {};
  for (const strip of strips) activity[strip.name] = new Array(buckets).fill(0);

  // Direct attribution: first location offset inside a strip's decl span.
  for (const hap of haps) {
    const loc = hap.locations?.[0];
    if (!loc) continue;
    const strip = strips.find((s) => loc.start >= s.start && loc.start <= s.end);
    if (!strip) continue;
    const level = Number.isFinite(hap.gain) ? hap.gain : 1;
    const from = Math.max(0, Math.floor(hap.begin * buckets));
    const to = Math.min(buckets - 1, Math.ceil(hap.end * buckets) - 1);
    for (let i = from; i <= to; i++) {
      activity[strip.name][i] = Math.max(activity[strip.name][i], level);
    }
  }

  // Groups inherit the max of their transitive members' buckets.
  const byName = new Map(strips.map((s) => [s.name, s]));
  const closure = (name: string, seen = new Set<string>()): string[] => {
    if (seen.has(name)) return [];
    seen.add(name);
    const strip = byName.get(name);
    if (!strip) return [];
    return [name, ...strip.refs.flatMap((r) => closure(r, seen))];
  };
  for (const strip of strips) {
    if (!strip.isGroup) continue;
    for (const member of closure(strip.name).slice(1)) {
      const source = activity[member];
      if (!source) continue;
      for (let i = 0; i < buckets; i++) {
        activity[strip.name][i] = Math.max(activity[strip.name][i], source[i]);
      }
    }
  }
  return activity;
}
