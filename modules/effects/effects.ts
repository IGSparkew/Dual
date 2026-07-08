/**
 * FX Rack model — pure helpers over the CodeRegion façade.
 *
 * The rack is a *derivation* of the clip's chained calls
 * (`const BASS = s("bd sd").lpf(800).room(0.4)`), never a separate state. It
 * only knows the simple units of its catalog; every other link (gain, fast,
 * advanced params like roomfade/lpenv/compressor…) is ignored and preserved
 * intact — the Code Editor owns those.
 *
 * All reads go through `chainCalls` (document-absolute spans); all writes are
 * pure code → code splices with offsets re-resolved from the current text on
 * every operation (a splice upstream shifts every offset downstream).
 */
import type { PanelCodeApi } from '@layout/api/PanelApi';
import type { Decl } from '@core/interpreter/CodeRegion';
import type { FxChainEntry } from '@core/types/fx';

// ─── Catalog (v1 — simple units, validated against superdough 1.3.0) ─────────

export interface ParamDef {
  /** Canonical method name — the one the rack writes. */
  method: string;
  /** Alias method names recognized on read (hand-written code). */
  aliases: readonly string[];
  /** Short knob label. */
  label: string;
  min: number;
  max: number;
  scale: 'lin' | 'log';
  /** Value written when the unit is added / the knob is first touched. */
  defaultValue: number;
  /** Round to integer on commit (coarse, crush). */
  integer?: boolean;
  /** Knob runs opposite to the value (crush: 1 = max effect, 16 = clean). */
  inverted?: boolean;
}

/** Enum-valued unit facet (vowel): dropdown only — superdough throws on an
 *  unknown vowel, so free text is never allowed. */
export interface EnumDef {
  method: string;
  aliases: readonly string[];
  choices: readonly string[];
  defaultValue: string;
}

/** Cross-clip target facet (duck): the method carries the VICTIM clip's orbit
 *  number; the UI shows a clip dropdown, never a knob. */
export interface TargetDef {
  method: string;
  aliases: readonly string[];
}

export interface UnitDef {
  id: string;
  name: string;
  /** Knob params; the FIRST one is the primary, written on add. */
  params: readonly ParamDef[];
  /** Present instead of knobs for enum units (vowel). */
  enum?: EnumDef;
  /** Cross-clip target facet (duck) — added/retargeted via `setDuckTarget`. */
  target?: TargetDef;
  /** Write EVERY param on add, not just the primary (compressor: the three
   *  knobs must match the code from the start). */
  addAll?: boolean;
}

/**
 * Units in superdough's PROCESSING order (filters → vowel → coarse → crush →
 * distort → tremolo → phaser → delay → reverb) — the order the ear hears; the
 * textual order of `.method()` calls in the code has no audible effect.
 *
 * Deliberately excluded: gain/pan (mixer's facet), synthesis params (future
 * synth module), compressor* (v2/editor), djf (global per-orbit node),
 * shape/shapevol (deprecated — distort replaces them), ir/iresponse, and the
 * superdirt controls that are no-ops in superdough (squiz, triode, ring…).
 */
export const EFFECT_CATALOG: readonly UnitDef[] = [
  {
    id: 'lpf',
    name: 'Low-pass',
    params: [
      { method: 'lpf', aliases: ['cutoff', 'ctf', 'lp'], label: 'Cutoff', min: 20, max: 20000, scale: 'log', defaultValue: 800 },
      { method: 'lpq', aliases: ['resonance'], label: 'Res', min: 0, max: 30, scale: 'lin', defaultValue: 1 },
    ],
  },
  {
    id: 'hpf',
    name: 'High-pass',
    params: [
      { method: 'hpf', aliases: ['hcutoff', 'hp'], label: 'Cutoff', min: 20, max: 20000, scale: 'log', defaultValue: 200 },
      { method: 'hpq', aliases: ['hresonance'], label: 'Res', min: 0, max: 30, scale: 'lin', defaultValue: 1 },
    ],
  },
  {
    id: 'bpf',
    name: 'Band-pass',
    params: [
      { method: 'bpf', aliases: ['bandf', 'bp'], label: 'Cutoff', min: 20, max: 20000, scale: 'log', defaultValue: 1000 },
      { method: 'bpq', aliases: ['bandq'], label: 'Res', min: 0, max: 30, scale: 'lin', defaultValue: 1 },
    ],
  },
  {
    id: 'vowel',
    name: 'Vowel',
    params: [],
    enum: {
      method: 'vowel',
      aliases: [],
      choices: ['a', 'e', 'i', 'o', 'u', 'ae', 'aa', 'oe', 'ue', 'y', 'uh', 'un', 'en', 'an', 'on'],
      defaultValue: 'a',
    },
  },
  {
    id: 'coarse',
    name: 'Downsample',
    params: [
      { method: 'coarse', aliases: [], label: 'Coarse', min: 1, max: 32, scale: 'lin', defaultValue: 4, integer: true },
    ],
  },
  {
    id: 'crush',
    name: 'Bitcrush',
    params: [
      // 1 = max effect, 16 = nearly clean — the knob is inverted so turning it
      // up always means "more effect".
      { method: 'crush', aliases: [], label: 'Crush', min: 1, max: 16, scale: 'lin', defaultValue: 8, integer: true, inverted: true },
    ],
  },
  {
    id: 'distort',
    name: 'Distortion',
    params: [
      { method: 'distort', aliases: ['dist'], label: 'Drive', min: 0, max: 10, scale: 'lin', defaultValue: 2 },
      // The worklet clamps postgain to 1 (attenuation only); distort gets loud
      // fast, hence the tame 0.6 default.
      { method: 'distortvol', aliases: ['distvol'], label: 'Vol', min: 0.001, max: 1, scale: 'lin', defaultValue: 0.6 },
    ],
  },
  {
    id: 'tremolo',
    name: 'Tremolo',
    params: [
      { method: 'tremolo', aliases: ['trem'], label: 'Rate', min: 0.1, max: 16, scale: 'log', defaultValue: 4 },
      { method: 'tremolodepth', aliases: ['tremdepth'], label: 'Depth', min: 0, max: 1, scale: 'lin', defaultValue: 0.6 },
    ],
  },
  {
    id: 'phaser',
    name: 'Phaser',
    params: [
      { method: 'phaser', aliases: ['phaserrate', 'ph'], label: 'Rate', min: 0.1, max: 8, scale: 'log', defaultValue: 1 },
      { method: 'phaserdepth', aliases: ['phd', 'phasdp'], label: 'Depth', min: 0, max: 1, scale: 'lin', defaultValue: 0.75 },
    ],
  },
  {
    id: 'delay',
    name: 'Delay',
    params: [
      { method: 'delay', aliases: [], label: 'Mix', min: 0, max: 1, scale: 'lin', defaultValue: 0.25 },
      { method: 'delaytime', aliases: ['delayt', 'dt'], label: 'Time', min: 0.01, max: 2, scale: 'lin', defaultValue: 0.19 },
      // Min 0.01: at 0 superdough cuts the whole delay line; max clamped 0.98.
      { method: 'delayfeedback', aliases: ['delayfb', 'dfb'], label: 'FB', min: 0.01, max: 0.98, scale: 'lin', defaultValue: 0.5 },
    ],
  },
  {
    id: 'reverb',
    name: 'Reverb',
    params: [
      { method: 'room', aliases: [], label: 'Mix', min: 0, max: 1, scale: 'lin', defaultValue: 0.4 },
      { method: 'roomsize', aliases: ['size', 'sz', 'rsize'], label: 'Size', min: 0.1, max: 10, scale: 'lin', defaultValue: 2 },
    ],
  },
];

// ─── Method index (canonical + aliases → owning unit/param) ──────────────────

interface MethodOwner {
  unit: UnitDef;
  param: ParamDef | null; // null → the unit's enum facet
}

/** methodName → owning unit/param, covering canonical names and aliases. */
const METHOD_INDEX: ReadonlyMap<string, MethodOwner> = (() => {
  const index = new Map<string, MethodOwner>();
  for (const unit of EFFECT_CATALOG) {
    for (const param of unit.params) {
      index.set(param.method, { unit, param });
      for (const alias of param.aliases) index.set(alias, { unit, param });
    }
    if (unit.enum) {
      index.set(unit.enum.method, { unit, param: null });
      for (const alias of unit.enum.aliases) index.set(alias, { unit, param: null });
    }
  }
  return index;
})();

/** Resolve any written method name (canonical or alias) to its owner. */
export function ownerOf(method: string): MethodOwner | undefined {
  return METHOD_INDEX.get(method);
}

// ─── Model (derived view) ────────────────────────────────────────────────────

/** One knob of a present unit. `value` is the literal read from the code, or
 *  null when the param is absent (the knob shows the default, written lazily
 *  on first touch). */
export interface RackParam {
  def: ParamDef;
  value: number | null;
}

export interface RackUnit {
  def: UnitDef;
  params: RackParam[];
  /** Enum facet value (vowel), null when absent. */
  enumValue: string | null;
  /** True when some argument is not a simple literal (pattern string, const
   *  reference, ternary…) or a param is duplicated — knobs locked, the unit is
   *  "managed in code" and only the Code Editor may touch it. */
  locked: boolean;
}

/** The rack as derived from the document: present units, in processing order. */
export interface Rack {
  clip: string;
  units: RackUnit[];
}

/** Read a single-argument numeric literal (null when not a simple number). */
function readNumArg(args: { source: string; isIdentifier: boolean }[]): number | null {
  if (args.length !== 1 || args[0].isIdentifier) return null;
  const value = Number(args[0].source.trim());
  return Number.isFinite(value) ? value : null;
}

/** Read a single-argument plain string literal (null otherwise). The arg
 *  source is an API-provided span, not the raw document. */
function readStrArg(args: { source: string; isIdentifier: boolean }[]): string | null {
  if (args.length !== 1 || args[0].isIdentifier) return null;
  const src = args[0].source.trim();
  if (src.length < 2) return null;
  const quote = src[0];
  if ((quote !== '"' && quote !== "'") || src[src.length - 1] !== quote) return null;
  const inner = src.slice(1, -1);
  return inner.includes(quote) ? null : inner;
}

/**
 * Derive the rack from the clip's chained calls. Unknown methods are ignored
 * (and preserved by every mutation); a catalog param whose argument is not a
 * simple literal, or that appears twice, locks its whole unit.
 */
export function deriveRack(api: PanelCodeApi, code: string, clip: string): Rack | null {
  const links = api.chainCalls(code, clip);
  if (links === null) return null;

  // Collect per-unit reads in one pass over the chain.
  interface Acc {
    values: Map<string, number>; // canonical param method → literal
    enumValue: string | null;
    locked: boolean;
    seen: Set<string>; // canonical methods already seen (duplicate detection)
  }
  const accs = new Map<string, Acc>(); // unit id → accumulator

  for (const link of links) {
    const owner = METHOD_INDEX.get(link.method);
    if (!owner) continue; // out of catalog — preserved, invisible to the rack

    let acc = accs.get(owner.unit.id);
    if (!acc) {
      acc = { values: new Map(), enumValue: null, locked: false, seen: new Set() };
      accs.set(owner.unit.id, acc);
    }

    const canonical = owner.param ? owner.param.method : owner.unit.enum!.method;
    if (acc.seen.has(canonical)) {
      acc.locked = true; // duplicated param — ambiguous, hands off
      continue;
    }
    acc.seen.add(canonical);

    if (owner.param) {
      const value = readNumArg(link.args);
      if (value === null) acc.locked = true;
      else acc.values.set(canonical, value);
    } else {
      const value = readStrArg(link.args);
      if (value === null || !owner.unit.enum!.choices.includes(value)) acc.locked = true;
      else acc.enumValue = value;
    }
  }

  // Project accumulators onto the catalog order (processing order).
  const units: RackUnit[] = [];
  for (const def of EFFECT_CATALOG) {
    const acc = accs.get(def.id);
    if (!acc) continue;
    units.push({
      def,
      params: def.params.map((p) => ({ def: p, value: acc.values.get(p.method) ?? null })),
      enumValue: acc.enumValue,
      locked: acc.locked,
    });
  }
  return { clip, units };
}

/** Units of the catalog absent from the rack — the "+ Add effect" choices. */
export function absentUnits(rack: Rack): UnitDef[] {
  const present = new Set(rack.units.map((u) => u.def.id));
  return EFFECT_CATALOG.filter((u) => !present.has(u.id));
}

/** Project a rack to the `fx:changed` payload shape. */
export function toFxChain(rack: Rack): FxChainEntry[] {
  return rack.units.map((unit) => {
    const params: Record<string, number | string> = {};
    for (const p of unit.params) {
      if (p.value !== null) params[p.def.method] = p.value;
    }
    if (unit.enumValue !== null) params[unit.def.enum!.method] = unit.enumValue;
    return { unit: unit.def.id, params };
  });
}

// ─── Clip choices (same filter as session/mixer) ─────────────────────────────

/** Clip names eligible for the rack: `const` whose initializer is a call —
 *  the same filter as the session grid and the mixer strips. */
export function deriveClipNames(api: PanelCodeApi, defs: Decl[]): string[] {
  const names: string[] = [];
  for (const def of defs) {
    if (def.declKind !== 'const' || def.initKind !== 'pattern') continue;
    const q = api.readExpr(def.source);
    if (q === null || !q.isCall()) continue;
    names.push(def.name);
  }
  return names;
}

// ─── Serialization / knob mapping ────────────────────────────────────────────

/** Serialize a param value as a stable literal (2 decimals max, integer for
 *  coarse/crush), clamped to the param's range. */
export function formatParam(def: ParamDef, value: number): string {
  const clamped = Math.min(def.max, Math.max(def.min, value));
  if (def.integer) return String(Math.round(clamped));
  return String(Math.round(clamped * 100) / 100);
}

/** Human-readable value readout for a knob. */
export function displayParam(def: ParamDef, value: number): string {
  if (def.integer) return String(Math.round(value));
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return String(Math.round(value * 100) / 100);
}

/** Map a param value to the knob's 0..1 position (log/lin scale, inversion). */
export function paramToNorm(def: ParamDef, value: number): number {
  const clamped = Math.min(def.max, Math.max(def.min, value));
  const norm =
    def.scale === 'log'
      ? Math.log(clamped / def.min) / Math.log(def.max / def.min)
      : (clamped - def.min) / (def.max - def.min);
  return def.inverted ? 1 - norm : norm;
}

/** Map a knob's 0..1 position back to the param value. */
export function normToParam(def: ParamDef, norm: number): number {
  const t = Math.min(1, Math.max(0, def.inverted ? 1 - norm : norm));
  const value =
    def.scale === 'log'
      ? def.min * Math.pow(def.max / def.min, t)
      : def.min + t * (def.max - def.min);
  return def.integer ? Math.round(value) : value;
}

// ─── Splices (all re-resolve offsets from the passed `code`) ─────────────────

/** The clip's declaration, or null when it vanished (document is the truth). */
function findDecl(api: PanelCodeApi, code: string, clip: string): Decl | null {
  return (api.list(code) ?? []).find((d) => d.name === clip) ?? null;
}

/** Append `.method(literal)` at the end of the clip's initializer chain. */
function appendCall(api: PanelCodeApi, code: string, clip: string, call: string): string {
  const def = findDecl(api, code, clip);
  if (!def || def.initKind !== 'pattern') return code;
  return api.spliceSpan(code, def.initEnd, def.initEnd, call);
}

/** The chain link carrying `param` (canonical or alias), or null. */
function findLink(api: PanelCodeApi, code: string, clip: string, canonical: string) {
  const links = api.chainCalls(code, clip);
  if (!links) return null;
  for (const link of links) {
    const owner = METHOD_INDEX.get(link.method);
    if (!owner) continue;
    const method = owner.param ? owner.param.method : owner.unit.enum!.method;
    if (method === canonical) return link;
  }
  return null;
}

/**
 * Add a unit to the clip: append its primary param at the default value
 * (`.lpf(800)`, `.vowel("a")`). Secondary params are provisioned lazily by
 * `setParam`, only when the user touches their knob — one call per parameter,
 * never the `"800:4"` form.
 */
export function addEffect(api: PanelCodeApi, code: string, clip: string, unit: UnitDef): string {
  if (unit.enum) {
    return appendCall(api, code, clip, `.${unit.enum.method}("${unit.enum.defaultValue}")`);
  }
  const primary = unit.params[0];
  return appendCall(api, code, clip, `.${primary.method}(${formatParam(primary, primary.defaultValue)})`);
}

/**
 * Set a knob param: splice the existing argument span in place (keeping the
 * alias the user wrote), or append `.method(value)` when the param is absent.
 */
export function setParam(
  api: PanelCodeApi,
  code: string,
  clip: string,
  param: ParamDef,
  value: number,
): string {
  const literal = formatParam(param, value);
  const link = findLink(api, code, clip, param.method);
  if (link && link.args.length === 1) {
    return api.spliceSpan(code, link.args[0].start, link.args[0].end, literal);
  }
  return appendCall(api, code, clip, `.${param.method}(${literal})`);
}

/** Set an enum facet (vowel) — value guaranteed by the dropdown choices. */
export function setEnum(
  api: PanelCodeApi,
  code: string,
  clip: string,
  unit: UnitDef,
  choice: string,
): string {
  if (!unit.enum || !unit.enum.choices.includes(choice)) return code;
  const link = findLink(api, code, clip, unit.enum.method);
  if (link && link.args.length === 1) {
    return api.spliceSpan(code, link.args[0].start, link.args[0].end, `"${choice}"`);
  }
  return appendCall(api, code, clip, `.${unit.enum.method}("${choice}")`);
}

/**
 * Remove a unit: splice out every chain link belonging to it (all its params,
 * canonical and aliases) — and nothing else. Links are removed right-to-left
 * so earlier spans stay valid within the single snapshot.
 */
export function removeEffect(api: PanelCodeApi, code: string, clip: string, unit: UnitDef): string {
  const links = api.chainCalls(code, clip);
  if (!links) return code;
  const mine = links
    .filter((link) => METHOD_INDEX.get(link.method)?.unit.id === unit.id)
    .sort((a, b) => b.start - a.start);
  let next = code;
  for (const link of mine) {
    next = api.spliceSpan(next, link.start, link.end, '');
  }
  return next;
}
