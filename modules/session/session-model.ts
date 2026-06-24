/**
 * Session model — pure helpers over the CodeRegion façade.
 *
 * A clip is a named `const`; its name is its immutable identity. The grid owns
 * two facets of a clip: its *gate* (`NAME_ON`, the live mute) and its *usage*
 * (the `$:` projection). It never owns the clip's content or the document.
 *
 * All reads slice exact source via the façade; all writes are string splices
 * with offsets re-resolved from the current text on every operation.
 */
import type { PanelCodeApi } from '@layout/api/PanelApi';
import type { ClipDef } from '@core/interpreter/CodeRegion';

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

export function deriveClips(api: PanelCodeApi, defs: ClipDef[]): RawClip[] {
  const byName = new Map(defs.map((d) => [d.name, d]));
  const clips: RawClip[] = [];

  for (const def of defs) {
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
  const output = api.locateOutput(code);
  if (output.kind !== 'dollar') return { names: [], complex: false };

  const region = code.slice(output.start, output.end);
  const names: string[] = [];
  let complex = false;

  for (const line of region.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(/^\$:\s*(.+?);?$/);
    if (!m) continue;
    const expr = m[1].trim();
    // The silence sentinel (`"~"` or `silence`) means "nothing launched".
    if (expr === SILENCE_TOKEN || expr === "'~'" || expr === 'silence') continue;
    if (/^[A-Za-z_$][\w$]*$/.test(expr)) names.push(expr);
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

/** Insert a const block just before the output region (after all other consts,
 *  preserving topological order since members are declared above). */
export function insertConst(api: PanelCodeApi, code: string, block: string): string {
  const output = api.locateOutput(code);
  const at = output.kind !== 'none' ? output.start : code.length;
  const head = code.slice(0, at);
  const tail = code.slice(at);
  const pre = head === '' || head.endsWith('\n') ? head : `${head}\n`;
  return `${pre}${block.trim()}\n${tail}`;
}

/** Remove a const declaration and its trailing newlines. */
export function removeConst(code: string, def: ClipDef): string {
  let end = def.end;
  while (code[end] === '\n') end++;
  return code.slice(0, def.start) + code.slice(end);
}

/**
 * Provision the gate machinery for a hand-written clip that lacks it: append
 * `.gain(NAME_ON ? NAME_GAIN : 0)` to its initializer and insert the gate/gain
 * consts just above it. Created muted (`NAME_ON = 0`) since the user just asked
 * to mute. The clip's content stays intact; subsequent mutes are 1-char flips.
 */
export function provisionGate(api: PanelCodeApi, code: string, def: ClipDef): string {
  const on = gateName(def.name);
  const gain = gainName(def.name);

  // 1) Append the gate chain at the end of the initializer.
  const declText = code.slice(def.start, def.end);
  const initEnd = def.start + declText.lastIndexOf(def.source) + def.source.length;
  let next = api.spliceSpan(code, initEnd, initEnd, `.gain(${on} ? ${gain} : 0)`);

  // 2) Insert the config consts right before the clip (re-resolved offsets).
  const def2 = (api.readClips(next) ?? []).find((d) => d.name === def.name);
  if (!def2) return next;
  return api.spliceSpan(next, def2.start, def2.start, `const ${gain} = 1;\nconst ${on} = 0;\n`);
}

/** Flip a gate const's value, splicing only the literal so the rest of the line
 *  (comments, spacing) stays byte-identical. */
export function flipGate(code: string, gateDef: ClipDef, value: 0 | 1): string {
  const declText = code.slice(gateDef.start, gateDef.end);
  const rel = declText.lastIndexOf(gateDef.source);
  const absStart = gateDef.start + rel;
  const absEnd = absStart + gateDef.source.length;
  return code.slice(0, absStart) + String(value) + code.slice(absEnd);
}

/** Append an output region (`$:` block or `arrange(...)`) at the end. */
function appendOutput(code: string, text: string): string {
  const pre = code === '' || code.endsWith('\n') ? code : `${code}\n`;
  return `${pre}${text}\n`;
}

/** Rewrite the `$:` block from the active clip names (session mode). Empty →
 *  `$: silence` so the output region is always present and evaluable. */
export function reprojectDollar(api: PanelCodeApi, code: string, names: string[]): string {
  const output = api.locateOutput(code);
  const dollar = projectDollar(names);
  if (output.kind === 'dollar') return api.spliceSpan(code, output.start, output.end, dollar);
  return appendOutput(code, dollar);
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
    const def = (api.readClips(next) ?? []).find((d) => d.name === target);
    if (def) next = removeConst(next, def);
  }
  return next;
}

/** Names of clips that reference `name` in their stack — deleting `name` while
 *  any exist would leave a dead reference. */
export function clipsReferencing(clips: RawClip[], name: string): string[] {
  return clips.filter((c) => c.name !== name && c.refs.includes(name)).map((c) => c.name);
}

/** Replace the output with an `arrange(...)` call (session → arrangement). */
export function toArrangement(
  api: PanelCodeApi,
  code: string,
  playing: string[],
  storedArrange: string,
): string {
  const output = api.locateOutput(code);
  const arrange =
    storedArrange.trim() ||
    (playing.length
      ? `arrange([4, stack(${playing.join(', ')})])`
      : `arrange([4, silence])`);
  if (output.kind === 'none') return appendOutput(code, arrange);
  return api.spliceSpan(code, output.start, output.end, arrange);
}

/** Replace the output with the `$:` block (arrangement → session); returns the
 *  captured arrange source so it can be stored in state for the round-trip. */
export function toSession(
  api: PanelCodeApi,
  code: string,
  playing: string[],
): { code: string; captured: string } {
  const output = api.locateOutput(code);
  const captured = output.kind === 'arrange' ? code.slice(output.start, output.end) : '';
  const dollar = projectDollar(playing);
  const next =
    output.kind === 'none'
      ? appendOutput(code, dollar)
      : api.spliceSpan(code, output.start, output.end, dollar);
  return { code: next, captured };
}
