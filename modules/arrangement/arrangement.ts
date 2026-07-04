/**
 * Arrangement model — pure helpers over the CodeRegion façade.
 *
 * The arrangement is the `arrange([duration, pattern], ...)` call that lives in
 * the output region when `outputMode === 'arrangement'`, and dormantly in
 * `store.arrangementCode` while session mode is active (the document only ever
 * holds the active mode's output). This module owns that call and nothing else:
 * it never touches declarations or the `$:` projection.
 *
 * Sections it cannot represent (non-literal duration, inline pattern) are kept
 * as opaque `complex` blocks and re-emitted verbatim by `buildArrange`.
 */
import type { PanelCodeApi } from '@layout/api/PanelApi';
import type { Decl } from '@core/interpreter/CodeRegion';
import type { OutputMode } from '@core/state/store';

/** One column of the timeline, derived from an `arrange(...)` source. */
export interface Section {
  /** Length in cycles (first element of the `[duration, pattern]` pair). */
  duration: number;
  /** Clip identifiers active in this section (empty = silence). */
  members: string[];
  /** True when the pattern is not silence/identifier/stack-of-identifiers —
   *  the block is opaque, read-only, and `rawSource` is re-emitted verbatim. */
  complex: boolean;
  /** Exact source of the whole `[duration, pattern]` pair. */
  rawSource: string;
}

export const DEFAULT_DURATION = 4;

/** Sentinel written for an empty section — also the transpiler-safe fallback. */
const SILENCE = 'silence';

// ─── Derivation (code → model) ───────────────────────────────────────────────

/** An opaque section preserving the exact source of an unrecognized pair. */
function opaque(rawSource: string): Section {
  return { duration: DEFAULT_DURATION, members: [], complex: true, rawSource };
}

/**
 * Parse an `arrange(...)` source into sections; null when the expression is
 * not an arrange call. Each argument must be a `[duration, pattern]` array
 * with a numeric duration and a silence/identifier/stack-of-identifiers
 * pattern — anything else becomes an opaque `complex` section.
 */
export function deriveArrangement(api: PanelCodeApi, source: string): Section[] | null {
  const query = api.readExpr(source);
  if (!query || query.callee() !== 'arrange') return null;

  const sections: Section[] = [];
  for (const arg of query.args()) {
    const pair = api.readExpr(arg.source);
    if (!pair || !pair.isArray()) {
      sections.push(opaque(arg.source));
      continue;
    }
    const items = pair.items();
    if (items.length !== 2) {
      sections.push(opaque(arg.source));
      continue;
    }

    const duration = Number(items[0].source.trim());
    if (!Number.isFinite(duration) || duration <= 0) {
      sections.push(opaque(arg.source));
      continue;
    }

    const pattern = items[1];
    const patternSource = pattern.source.trim();
    if (patternSource === SILENCE) {
      sections.push({ duration, members: [], complex: false, rawSource: arg.source });
      continue;
    }
    if (pattern.isIdentifier) {
      sections.push({
        duration,
        members: [patternSource],
        complex: false,
        rawSource: arg.source,
      });
      continue;
    }
    const call = api.readExpr(pattern.source);
    if (call && call.callee() === 'stack') {
      const args = call.args();
      if (args.every((a) => a.isIdentifier)) {
        sections.push({
          duration,
          members: args.map((a) => a.source.trim()),
          complex: false,
          rawSource: arg.source,
        });
        continue;
      }
    }
    sections.push(opaque(arg.source));
  }
  return sections;
}

/** Clip rows of the timeline: consts whose initializer is a call — the same
 *  filter as the session grid, so both views agree on what a clip is. */
export function deriveTrackNames(api: PanelCodeApi, defs: Decl[]): string[] {
  const names: string[] = [];
  for (const def of defs) {
    if (def.declKind !== 'const' || def.initKind !== 'pattern') continue;
    const q = api.readExpr(def.source);
    if (q === null || !q.isCall()) continue;
    names.push(def.name);
  }
  return names;
}

/** Where the arrangement currently lives, and whether it is the live output. */
export interface ArrangeLocation {
  source: string;
  /** True when the arrange is the document's output (arrangement mode);
   *  false when it is the dormant store copy (session mode). */
  live: boolean;
}

/**
 * Resolve the arrangement source for the current mode. Arrangement mode reads
 * the document's output (null on mismatch — the user rewrote it by hand);
 * session mode reads the dormant store copy (null when empty).
 */
export function locateArrange(
  api: PanelCodeApi,
  code: string,
  storedArrange: string,
  mode: OutputMode,
): ArrangeLocation | null {
  if (mode === 'arrangement') {
    const source = api.outputSource(code);
    if (source === null || api.readExpr(source)?.callee() !== 'arrange') return null;
    return { source, live: true };
  }
  const stored = storedArrange.trim();
  if (!stored || api.readExpr(stored)?.callee() !== 'arrange') return null;
  return { source: stored, live: false };
}

// ─── Mutations (pure, model → model) ─────────────────────────────────────────

export function toggleMember(sections: Section[], index: number, name: string): Section[] {
  return sections.map((s, i) => {
    if (i !== index || s.complex) return s;
    const members = s.members.includes(name)
      ? s.members.filter((m) => m !== name)
      : [...s.members, name];
    return { ...s, members };
  });
}

export function setDuration(sections: Section[], index: number, duration: number): Section[] {
  if (!Number.isFinite(duration) || duration <= 0) return sections;
  return sections.map((s, i) => (i === index && !s.complex ? { ...s, duration } : s));
}

export function addSection(sections: Section[], duration = DEFAULT_DURATION): Section[] {
  return [...sections, { duration, members: [], complex: false, rawSource: '' }];
}

export function removeSection(sections: Section[], index: number): Section[] {
  return sections.filter((_, i) => i !== index);
}

export function moveSection(sections: Section[], from: number, to: number): Section[] {
  if (to < 0 || to >= sections.length || from === to) return sections;
  const next = sections.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// ─── Serialization (model → code) ────────────────────────────────────────────

/** One `[duration, pattern]` pair. 0 members → silence; 1 → bare identifier;
 *  n → `stack(a, b)`. Complex sections re-emit their source verbatim. */
function buildSection(s: Section): string {
  if (s.complex) return s.rawSource;
  const pattern =
    s.members.length === 0
      ? SILENCE
      : s.members.length === 1
        ? s.members[0]
        : `stack(${s.members.join(', ')})`;
  return `[${s.duration}, ${pattern}]`;
}

/**
 * Serialize the arrange call. An empty list yields `arrange([4, silence])`:
 * the document must always end on an evaluable expression (transpiler rule),
 * so the arrangement never serializes to nothing.
 */
export function buildArrange(sections: Section[]): string {
  if (sections.length === 0) return `arrange([${DEFAULT_DURATION}, ${SILENCE}])`;
  return `arrange(${sections.map(buildSection).join(', ')})`;
}
