/**
 * Session model — pure helpers over the CodeRegion façade.
 *
 * A clip is a named `const`; its name is its immutable identity. The grid owns
 * two facets of a clip: its *gate* (`NAME_ON`, the live mute) and its *usage*
 * (the `$:` projection). It never owns the clip's content or the document.
 *
 * All reads slice exact source via the façade; all writes go through the
 * façade's structure-preserving transforms (offsets re-resolved from the
 * current text on every operation).
 */
import type { PanelCodeApi } from '@layout/api/PanelApi';
import type { Decl } from '@core/interpreter/CodeRegion';
import type { SampleDragPayload } from '@core/types/sample-drag';

/** A clip as the grid sees it, derived from the document. */
export interface RawClip {
  /** Const identifier — immutable identity. */
  name: string;
  /** Exact source of the initializer (`stack(...)` + chain). */
  source: string;
  /** Names referenced as stack arguments (empty for a clip-leaf). */
  refs: string[];
  /** True when the stack arguments are identifiers (a composition). */
  isGroup: boolean;
  /** True when a `NAME_ON` gate const exists — the grid can manage its mute. */
  hasGate: boolean;
  /** Gate state: `NAME_ON === 0`. */
  isMuted: boolean;
  /** Declaration offsets in the document. */
  start: number;
  end: number;
}

/** Identifiers projected by the live output, and whether any line is complex. */
export interface DollarRefs {
  names: string[];
  /** True if the user hand-wrote a non-trivial `$:` line — grid steps back. */
  complex: boolean;
}

// ─── Naming convention (clip ↔ its config consts) ───────────────────────────

export function gateName(clip: string): string {
  return `${clip.toUpperCase()}_ON`;
}

export function gainName(clip: string): string {
  return `${clip.toUpperCase()}_GAIN`;
}

/** A const is a material clip when its initializer is a call (`stack(...)`,
 *  `note(...)`, …). Config consts (literals, colors, gates) are not. */
export function isClipInit(api: PanelCodeApi, source: string): boolean {
  const q = api.readExpr(source);
  return q !== null && q.isCall();
}

/** Initial clip content per editor type — what the "new clip" form creates.
 *  Both land inside the matching grid's mini-notation subset (8 steps).
 *  The drum template starts silent: a bare `bd` never resolves without an
 *  installed bank (see [[sound-map-banks]]) — the user picks a bank or adds
 *  rows explicitly via the drum grid toolbar instead of hitting a missing
 *  sample on the very first clip. */
export const CLIP_TEMPLATES = {
  drum: 's("~ ~ ~ ~ ~ ~ ~ ~")',
  piano: 'note("~ ~ ~ ~ ~ ~ ~ ~")',
} as const;

export type ClipType = keyof typeof CLIP_TEMPLATES;

/** A clip name must be a plain JS identifier — it becomes a `const`. Keywords
 *  are caught downstream by the parse check on the prospective document. */
export function isValidClipName(name: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
}

/** Generate a unique, valid JS identifier not colliding with any taken name or
 *  its derived gate/gain consts. */
export function uniqueName(taken: string[], base = 'clip'): string {
  const used = new Set(taken);
  for (let i = 1; ; i++) {
    const name = `${base}${i}`;
    if (!used.has(name) && !used.has(gateName(name)) && !used.has(gainName(name))) {
      return name;
    }
  }
}

// ─── Derivation (code → model) ───────────────────────────────────────────────

export function deriveClips(api: PanelCodeApi, defs: Decl[]): RawClip[] {
  const byName = new Map(defs.map((d) => [d.name, d]));
  const clips: RawClip[] = [];

  for (const def of defs) {
    // A clip is a `const` whose initializer is a call; config consts are not.
    if (def.declKind !== 'const' || def.initKind !== 'pattern') continue;
    if (!isClipInit(api, def.source)) continue;
    const gate = byName.get(gateName(def.name));
    clips.push({
      name: def.name,
      source: def.source,
      refs: def.refs,
      isGroup: def.refs.length > 0,
      hasGate: gate !== undefined,
      isMuted: gate !== undefined && gate.source.trim() === '0',
      start: def.start,
      end: def.end,
    });
  }
  return clips;
}

/** Read the identifiers projected by the `$:` block. */
export function dollarRefs(api: PanelCodeApi, code: string): DollarRefs {
  const names: string[] = [];
  let complex = false;

  for (const expr of api.dollarExprs(code)) {
    const source = expr.source.trim();
    // The silence sentinel (`"~"` or `silence`) means "nothing launched".
    if (source === SILENCE_TOKEN || source === "'~'" || source === 'silence') continue;
    if (expr.isIdentifier) names.push(source);
    else complex = true;
  }
  return { names, complex };
}

// ─── Code fragments ──────────────────────────────────────────────────────────

/** The two config consts that back a clip's gate and fader. */
function gateConsts(name: string): string {
  return `const ${gainName(name)} = 1;\nconst ${gateName(name)} = 1;`;
}

/** A clip-leaf with raw material and the canonical gate/gain chain. */
export function buildLeaf(name: string, content: string): string {
  return `${gateConsts(name)}\nconst ${name} = stack(${content}).gain(${gateName(name)} ? ${gainName(name)} : 0);`;
}

/** A clip-group referencing existing clips by name. */
export function buildGroup(name: string, members: string[]): string {
  return `${gateConsts(name)}\nconst ${name} = stack(${members.join(', ')}).gain(${gateName(name)} ? ${gainName(name)} : 0);`;
}

/** The "nothing launched" sentinel — `~` is the mini-notation rest (silence). */
const SILENCE_TOKEN = '"~"';

/**
 * Project the live output as one `$:` line per active clip. When nothing is
 * launched, emit `$: "~"` (mini-notation rest): in session mode the document
 * must always end on a valid output expression — otherwise a trailing `const`
 * makes the Strudel transpiler throw (and the scheduler keeps the last pattern).
 */
export function projectDollar(names: string[]): string {
  if (names.length === 0) return `$: ${SILENCE_TOKEN}`;
  return names.map((n) => `$: ${n}`).join('\n');
}

// ─── Splices (all re-resolve offsets from the passed `code`) ─────────────────

/**
 * Provision the gate machinery for a hand-written clip that lacks it: append
 * `.gain(NAME_ON ? NAME_GAIN : 0)` to its initializer and insert the gate/gain
 * consts just above it. Created muted (`NAME_ON = 0`) since the user just asked
 * to mute. The clip's content stays intact; subsequent mutes are 1-char flips.
 */
export function provisionGate(api: PanelCodeApi, code: string, def: Decl): string {
  const on = gateName(def.name);
  const gain = gainName(def.name);

  // 1) Append the gate chain at the end of the initializer (offset from Decl).
  let next = api.spliceSpan(code, def.initEnd, def.initEnd, `.gain(${on} ? ${gain} : 0)`);

  // 2) Insert the config consts right before the clip (re-resolved offsets).
  const def2 = (api.list(next) ?? []).find((d) => d.name === def.name);
  if (!def2) return next;
  return api.spliceSpan(next, def2.start, def2.start, `const ${gain} = 1;\nconst ${on} = 0;\n`);
}

/** Rewrite the `$:` block from the active clip names (session mode). Empty →
 *  `$: "~"` so the output region is always present and evaluable. */
export function reprojectDollar(api: PanelCodeApi, code: string, names: string[]): string {
  return api.setOutput(code, projectDollar(names));
}

/**
 * Remove a clip: unproject it from the live output, then delete its `const` and
 * its gate/gain consts (offsets re-resolved between each splice). The caller
 * must first ensure no other clip references `name` (dead-ref guard) — use
 * `clipsReferencing`.
 */
export function removeClip(
  api: PanelCodeApi,
  code: string,
  name: string,
  playing: string[],
): string {
  let next = reprojectDollar(api, code, playing.filter((n) => n !== name));
  for (const target of [name, gateName(name), gainName(name)]) {
    next = api.removeDecl(next, target);
  }
  return next;
}

/** Names of clips that reference `name` in their stack — deleting `name` while
 *  any exist would leave a dead reference. */
export function clipsReferencing(clips: RawClip[], name: string): string[] {
  return clips.filter((c) => c.name !== name && c.refs.includes(name)).map((c) => c.name);
}

/** The referenceable members of a group `const name = stack(a, b)…`: the
 *  identifier arguments of its root call. Inline (anonymous) args are dropped —
 *  they have no name to promote. */
export function groupMembers(api: PanelCodeApi, code: string, name: string): string[] {
  const args = api.callArgs(code, name);
  if (!args) return [];
  return args.filter((a) => a.isIdentifier).map((a) => a.source.trim());
}

/**
 * Ungroup by *expanding*: remove the group const (and its gate/gain) but, if it
 * was playing, project its members individually so the music keeps going. The
 * members already exist as their own consts, so they remain launchable.
 *
 * The caller must first ensure no other clip references the group (dead-ref
 * guard) — use `clipsReferencing`.
 */
export function expandGroup(
  api: PanelCodeApi,
  code: string,
  name: string,
  playing: string[],
): string {
  const members = groupMembers(api, code, name);
  const wasPlaying = playing.includes(name);
  const nextPlaying = wasPlaying
    ? [...playing.filter((n) => n !== name), ...members.filter((m) => !playing.includes(m))]
    : playing.filter((n) => n !== name);

  // Re-project first (members still exist), then delete the group + its consts.
  let next = reprojectDollar(api, code, nextPlaying);
  for (const target of [name, gateName(name), gainName(name)]) {
    next = api.removeDecl(next, target);
  }
  return next;
}

/** True when the live output is a hand-driven `arrange(...)` expression. */
function isArrangeOutput(api: PanelCodeApi, code: string): boolean {
  if (api.locateOutput(code).kind !== 'expression') return false;
  const source = api.outputSource(code);
  if (source === null) return false;
  return api.readExpr(source)?.callee() === 'arrange';
}

/** Replace the output with an `arrange(...)` call (session → arrangement). */
export function toArrangement(
  api: PanelCodeApi,
  code: string,
  playing: string[],
  storedArrange: string,
): string {
  const arrange =
    storedArrange.trim() ||
    (playing.length
      ? `arrange([4, stack(${playing.join(', ')})])`
      : `arrange([4, silence])`);
  return api.setOutput(code, arrange);
}

/** Replace the output with the `$:` block (arrangement → session); returns the
 *  captured arrange source so it can be stored in state for the round-trip. */
export function toSession(
  api: PanelCodeApi,
  code: string,
  playing: string[],
): { code: string; captured: string } {
  const captured = isArrangeOutput(api, code) ? api.outputSource(code) ?? '' : '';
  return { code: api.setOutput(code, projectDollar(playing)), captured };
}

// ─── Dropped sounds (browser → clip) ─────────────────────────────────────────
// The session applies these because it owns the clip convention: a drop lands
// on ITS grid, so the shapes below are the same ones buildLeaf/provisionGate
// produce. The browser's only contribution is the drag payload.

/** Bank const of a clip — the drum grid's convention (`NAME_BANK`), mirrored
 *  here rather than imported so the two modules stay independent. Writing the
 *  same shape is what makes a bank dropped here show up in its selector. */
export function bankName(clip: string): string {
  return `${clip.toUpperCase()}_BANK`;
}

/** Eight rests — a dropped sound creates the clip, the grid/roll fills it in. */
const REST_PATTERN = '~ ~ ~ ~ ~ ~ ~ ~';

/**
 * Content for a clip created by dropping a sound on empty space, ready to be
 * wrapped by `buildLeaf`:
 *  - a bank    → `s("bd ~ …").bank(NAME_BANK)` (const emitted separately);
 *  - a pitched → `note("~ …").sound("user_epiano")`;
 *  - a sample  → `s("user_kick ~ …")`.
 */
export function droppedClipContent(
  clip: string,
  payload: SampleDragPayload,
  instrument = 'bd',
): string {
  if (payload.bank !== null) {
    return `s("${instrument} ${REST_PATTERN}").bank(${bankName(clip)})`;
  }
  if (payload.kind === 'pitched') {
    return `note("${REST_PATTERN}").sound(${JSON.stringify(payload.soundName)})`;
  }
  return `s("${payload.soundName} ${REST_PATTERN}")`;
}

/**
 * Insert the clip a dropped sound produces. A bank needs its `NAME_BANK` const
 * declared before the clip that references it, hence two `insertDecl` calls —
 * `insertDecl` places each just before the output, so declaration order
 * follows insertion order.
 */
export function insertDroppedClip(
  api: PanelCodeApi,
  code: string,
  clip: string,
  payload: SampleDragPayload,
): string {
  let next = code;
  if (payload.bank !== null) {
    next = api.insertDecl(next, `const ${bankName(clip)} = ${JSON.stringify(payload.bank)};`);
  }
  return api.insertDecl(next, buildLeaf(clip, droppedClipContent(clip, payload)));
}

/**
 * Retarget an existing clip at a dropped sound.
 *
 * A bank goes through the drum grid's machinery (`NAME_BANK` const referenced
 * by `.bank(...)`), provisioned on first touch and only re-valued afterwards.
 * A plain sound rewrites the `.sound(...)`/`.s(...)` argument in place, falling
 * back to the root constructor's argument (`s("bd")` — `chainCalls` excludes
 * the root) and finally to appending `.sound("…")`.
 */
export function applyDroppedSound(
  api: PanelCodeApi,
  code: string,
  clip: string,
  payload: SampleDragPayload,
): string {
  return payload.bank !== null
    ? setClipBank(api, code, clip, payload.bank)
    : setClipSound(api, code, clip, payload.soundName);
}

export function setClipSound(
  api: PanelCodeApi,
  code: string,
  clip: string,
  soundName: string,
): string {
  const def = (api.list(code) ?? []).find((d) => d.name === clip);
  if (!def || def.initKind !== 'pattern') return code;

  const literal = JSON.stringify(soundName);
  // chainCalls spans are document-absolute; rebase them onto `def.source` so
  // the whole initializer can be handed to setInit.
  const rebase = (start: number, end: number): string =>
    def.source.slice(0, start - def.initStart) + literal + def.source.slice(end - def.initStart);

  const link = (api.chainCalls(code, clip) ?? []).find(
    (l) => l.method === 'sound' || l.method === 's',
  );
  if (link && link.args.length >= 1) {
    return api.setInit(code, clip, rebase(link.args[0].start, link.args[0].end));
  }
  if (def.callee === 's' || def.callee === 'sound') {
    const args = api.callArgs(code, clip);
    if (args && args.length >= 1) {
      return api.setInit(code, clip, rebase(args[0].start, args[0].end));
    }
  }
  return api.setInit(code, clip, `${def.source}.sound(${literal})`);
}

export function setClipBank(
  api: PanelCodeApi,
  code: string,
  clip: string,
  bank: string,
): string {
  const defs = api.list(code) ?? [];
  const constName = bankName(clip);
  if (defs.some((d) => d.name === constName)) {
    return api.setInit(code, constName, JSON.stringify(bank));
  }
  const def = defs.find((d) => d.name === clip);
  if (!def || def.initKind !== 'pattern') return code;

  const withCall = api.spliceSpan(code, def.initEnd, def.initEnd, `.bank(${constName})`);
  // The splice above shifts every offset downstream — re-resolve before the
  // const insertion (same dance as provisionGate).
  const moved = (api.list(withCall) ?? []).find((d) => d.name === clip);
  if (!moved) return withCall;
  return api.spliceSpan(
    withCall,
    moved.start,
    moved.start,
    `const ${constName} = ${JSON.stringify(bank)};\n`,
  );
}
