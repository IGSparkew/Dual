/**
 * Tests for the split/merge model (Partie 1 of the drum-grid-split plan):
 * `splitToClips`, `checkMergeGroup`, `mergeGroupClips`, and group detection
 * (`GridClip.group` via `deriveClips`).
 *
 * These exercise the REAL `codeRegion` implementation (same convention as
 * `drum-grid.test.ts` and `mixer.test.ts` — the read/splice surface is pure
 * text + acorn, no mocking needed) so the TDZ-order guarantee is checked
 * against the actual parser, not an assumption about it.
 */
import { describe, it, expect } from 'vitest';
import { codeRegion } from '@core/interpreter/impl/CodeRegionImpl';
import type { PanelCodeApi } from '@layout/api/PanelApi';
import {
  checkMergeGroup,
  deriveClips,
  deriveGrid,
  mergeGroupClips,
  splitToClips,
  type DrumGrid,
} from './drum-grid';

const api = codeRegion as unknown as PanelCodeApi;

/** Index of a declaration by name in `code` (throws if the document doesn't
 *  parse — every fixture below is expected to). */
function declIndex(code: string, name: string): number {
  const defs = api.list(code)!;
  const i = defs.findIndex((d) => d.name === name);
  expect(i, `expected a declaration named "${name}" in:\n${code}`).toBeGreaterThanOrEqual(0);
  return i;
}

describe('splitToClips', () => {
  it('explodes a 3-row clip into 3 leaf clips, each with its own gate/gain, before the parent', () => {
    const code = 'const drums = stack(s("bd sd hh bd")).gain(0.8);';
    const grid = deriveGrid(api, code, 'drums')!;
    expect(grid.rows.map((r) => r.sample)).toEqual(['bd', 'sd', 'hh']);

    const next = splitToClips(api, code, 'drums', grid);
    const defs = api.list(next)!;
    const names = defs.map((d) => d.name);

    expect(names).toContain('drums_bd');
    expect(names).toContain('drums_sd');
    expect(names).toContain('drums_hh');
    // Each leaf gets its own gate/gain consts (session/mixer convention).
    for (const child of ['DRUMS_BD', 'DRUMS_SD', 'DRUMS_HH']) {
      expect(names).toContain(`${child}_ON`);
      expect(names).toContain(`${child}_GAIN`);
    }

    // Each leaf clip is itself a valid single-row drum-grid clip.
    const bdGrid = deriveGrid(api, next, 'drums_bd')!;
    expect(bdGrid.rows).toEqual([{ sample: 'bd', steps: [1, 0, 0, 1] }]);
    const sdGrid = deriveGrid(api, next, 'drums_sd')!;
    expect(sdGrid.rows).toEqual([{ sample: 'sd', steps: [0, 1, 0, 0] }]);
    const hhGrid = deriveGrid(api, next, 'drums_hh')!;
    expect(hhGrid.rows).toEqual([{ sample: 'hh', steps: [0, 0, 1, 0] }]);
  });

  it('turns the parent into `stack(child1, child2, …)`, preserving its own chain (.gain, .slow)', () => {
    const code = 'const drums = stack(s("bd sd")).gain(0.8).slow(2);';
    const grid = deriveGrid(api, code, 'drums')!;
    const next = splitToClips(api, code, 'drums', grid);

    const args = api.callArgs(next, 'drums')!;
    expect(args.every((a) => a.isIdentifier)).toBe(true);
    expect(args.map((a) => a.source)).toEqual(['drums_bd', 'drums_sd']);

    const parentDef = api.list(next)!.find((d) => d.name === 'drums')!;
    expect(parentDef.callee).toBe('stack');
    // The chain that lived on the parent is untouched — only the stack
    // arguments were replaced.
    expect(parentDef.source).toContain('.gain(0.8)');
    expect(parentDef.source).toContain('.slow(2)');
  });

  it('respects TDZ order: every child declaration appears BEFORE the parent in the produced text', () => {
    const code = 'const drums = stack(s("bd sd hh cp")).gain(0.8);';
    const grid = deriveGrid(api, code, 'drums')!;
    const next = splitToClips(api, code, 'drums', grid);

    const parentIndex = declIndex(next, 'drums');
    for (const child of ['drums_bd', 'drums_sd', 'drums_hh', 'drums_cp']) {
      expect(declIndex(next, child)).toBeLessThan(parentIndex);
    }

    // The strongest form of this guarantee: the real dependency-graph
    // validator (the one `validateGraph` callers rely on to surface a
    // "dead-ref" banner) sees no error at all on the produced text.
    expect(api.validateGraph(api.list(next)!)).toEqual([]);
  });

  it('respects TDZ order even with a document preamble before the parent (gate/gain consts, other clips)', () => {
    const code = [
      'const DRUMS_GAIN = 1;',
      'const DRUMS_ON = 1;',
      'const bass = stack(s("bass"));',
      'const drums = stack(s("bd sd")).gain(DRUMS_ON ? DRUMS_GAIN : 0);',
      '$: drums',
    ].join('\n');
    const grid = deriveGrid(api, code, 'drums')!;
    const next = splitToClips(api, code, 'drums', grid);

    expect(api.validateGraph(api.list(next)!)).toEqual([]);
    expect(declIndex(next, 'drums_bd')).toBeLessThan(declIndex(next, 'drums'));
    expect(declIndex(next, 'drums_sd')).toBeLessThan(declIndex(next, 'drums'));
    // The unrelated preamble and the output are left in place.
    expect(next).toContain('const bass = stack(s("bass"));');
    expect(next.trim().endsWith('$: drums')).toBe(true);
  });

  it('deduplicates two rows that sanitize to the same child name (uniqueChildName)', () => {
    // `hh:1` and `hh_1` both sanitize to the suffix `hh_1` (`:` → `_`, and
    // `hh_1` is already a legal identifier suffix) — a genuine collision,
    // unlike e.g. `hh:1`/`hh:2` which stay distinct after sanitizing.
    const grid: DrumGrid = {
      rows: [
        { sample: 'hh:1', steps: [1, 0] },
        { sample: 'hh_1', steps: [0, 1] },
      ],
      stepCount: 2,
      form: 'split',
    };
    const code = 'const drums = stack(s("~ ~")).gain(1);';
    const next = splitToClips(api, code, 'drums', grid);

    const leafNames = api
      .list(next)!
      .filter((d) => d.initKind === 'pattern' && d.callee === 'stack' && d.name.startsWith('drums_'))
      .map((d) => d.name);
    // First row claims the base name; the second is suffixed with `2`
    // appended directly to the base (mirrors `uniqueName` in session.ts) —
    // `drums_hh_12`, NOT `drums_hh_1_2`.
    expect(leafNames).toEqual(['drums_hh_1', 'drums_hh_12']);
    expect(api.callArgs(next, 'drums')!.map((a) => a.source)).toEqual([
      'drums_hh_1',
      'drums_hh_12',
    ]);
  });

  it('dedupes against a plain-name collision already present elsewhere in the document', () => {
    const code = [
      'const drums_bd = 999; // unrelated pre-existing const, same name a leaf would want',
      'const drums = stack(s("bd bd")).gain(1);',
    ].join('\n');
    const grid = deriveGrid(api, code, 'drums')!;
    const next = splitToClips(api, code, 'drums', grid);

    const leafNames = api
      .list(next)!
      .filter((d) => d.initKind === 'pattern' && d.callee === 'stack' && d.name.startsWith('drums_bd'))
      .map((d) => d.name);
    expect(leafNames).toEqual(['drums_bd2']);
    // The unrelated pre-existing const survives untouched.
    expect(next).toContain('const drums_bd = 999;');
  });

  it('dedupes against a pre-existing GATE const even when the plain child name is free', () => {
    // `drums_bd` itself is not taken, but its derived gate const is — the
    // free-name check must look at NAME_ON / NAME_GAIN too, not just NAME.
    const code = [
      'const DRUMS_BD_ON = 0; // pre-existing, unrelated to the split',
      'const drums = stack(s("bd bd")).gain(1);',
    ].join('\n');
    const grid = deriveGrid(api, code, 'drums')!;
    const next = splitToClips(api, code, 'drums', grid);

    const leafNames = api
      .list(next)!
      .filter((d) => d.initKind === 'pattern' && d.callee === 'stack' && d.name.startsWith('drums_bd'))
      .map((d) => d.name);
    expect(leafNames).toEqual(['drums_bd2']);
  });

  it('is a no-op when the named parent does not exist', () => {
    const code = 'const other = stack(s("bd"));';
    const grid: DrumGrid = { rows: [{ sample: 'bd', steps: [1] }], stepCount: 1, form: 'merged' };
    expect(splitToClips(api, code, 'missing', grid)).toBe(code);
  });
});

describe('deriveClips — group detection (GridClip.group)', () => {
  it('detects `stack(a, b)` of two valid single-row drum clips as a group', () => {
    const code = [
      'const a = stack(s("bd bd"));',
      'const b = stack(s("sd sd"));',
      'const g = stack(a, b);',
    ].join('\n');
    const defs = api.list(code)!;
    const clips = deriveClips(api, code, defs);
    const g = clips.find((c) => c.name === 'g')!;
    expect(g.grid).toBeNull(); // a stack of identifiers is not itself a mini pattern
    expect(g.group).toEqual(['a', 'b']);
  });

  it('does NOT detect a group when a member is not a valid drum-grid clip (deriveGrid null)', () => {
    const code = [
      'const a = stack(s("bd bd"));',
      'const b = 5;', // not even a call — deriveGrid(b) is null
      'const g = stack(a, b);',
    ].join('\n');
    const defs = api.list(code)!;
    const clips = deriveClips(api, code, defs);
    const g = clips.find((c) => c.name === 'g')!;
    expect(g.group).toBeNull();
  });

  it('does NOT detect a group when a member is a `stack` clip outside the drum-grid mini-notation subset', () => {
    const code = [
      'const a = stack(s("bd bd"));',
      'const b = stack(note("c e g"));', // a real pattern, but not s(...) drum content
      'const g = stack(a, b);',
    ].join('\n');
    const defs = api.list(code)!;
    const clips = deriveClips(api, code, defs);
    const g = clips.find((c) => c.name === 'g')!;
    expect(g.group).toBeNull();
  });

  it('does not report a group for a clip that already parses as a grid itself', () => {
    // `deriveGroup` is only meaningful once `deriveGrid` already returned
    // null; a plain multi-row clip must not also carry a `group`.
    const code = 'const drums = stack(s("bd sd hh"));';
    const defs = api.list(code)!;
    const clips = deriveClips(api, code, defs);
    const drums = clips.find((c) => c.name === 'drums')!;
    expect(drums.grid).not.toBeNull();
    expect(drums.group).toBeNull();
  });
});

describe('checkMergeGroup', () => {
  const baseCode = [
    'const drums_bd = stack(s("bd bd")).gain(1);',
    'const drums_sd = stack(s("sd sd")).gain(1);',
    'const drums = stack(drums_bd, drums_sd);',
    '$: drums',
  ].join('\n');

  it('returns an empty array when no member is referenced anywhere else', () => {
    expect(checkMergeGroup(api, baseCode, 'drums', ['drums_bd', 'drums_sd'])).toEqual([]);
  });

  it('lists a member referenced by ANOTHER const (not just the parent) as blocking', () => {
    const code = [
      'const drums_bd = stack(s("bd bd")).gain(1);',
      'const drums_sd = stack(s("sd sd")).gain(1);',
      'const drums = stack(drums_bd, drums_sd);',
      'const extra = stack(drums_bd, s("cp cp"));', // still uses drums_bd
      '$: drums',
    ].join('\n');
    const blocked = checkMergeGroup(api, code, 'drums', ['drums_bd', 'drums_sd']);
    expect(blocked).toEqual(['drums_bd']);
  });

  it('lists a member projected directly in `$:` as blocking', () => {
    const code = [
      'const drums_bd = stack(s("bd bd")).gain(1);',
      'const drums_sd = stack(s("sd sd")).gain(1);',
      'const drums = stack(drums_bd, drums_sd);',
      '$: drums_bd', // launched directly, bypassing the group
    ].join('\n');
    const blocked = checkMergeGroup(api, code, 'drums', ['drums_bd', 'drums_sd']);
    expect(blocked).toEqual(['drums_bd']);
  });

  it('reports both blocking reasons together when they apply to different members', () => {
    const code = [
      'const drums_bd = stack(s("bd bd")).gain(1);',
      'const drums_sd = stack(s("sd sd")).gain(1);',
      'const drums = stack(drums_bd, drums_sd);',
      'const extra = stack(drums_bd, s("cp cp"));',
      '$: drums_sd',
    ].join('\n');
    const blocked = checkMergeGroup(api, code, 'drums', ['drums_bd', 'drums_sd']);
    expect(new Set(blocked)).toEqual(new Set(['drums_bd', 'drums_sd']));
  });

  it('does not flag the group\'s own reference to its members as blocking', () => {
    // Sanity: `drums` referencing drums_bd/drums_sd (the expected shape of a
    // split group) must never itself count as a block.
    expect(checkMergeGroup(api, baseCode, 'drums', ['drums_bd', 'drums_sd'])).toEqual([]);
  });
});

describe('mergeGroupClips', () => {
  it('folds member rows into one merged mini-notation on the parent, preserving its chain', () => {
    const code = [
      'const DRUMS_BD_GAIN = 1;',
      'const DRUMS_BD_ON = 1;',
      'const drums_bd = stack(s("bd ~ bd ~")).gain(DRUMS_BD_ON ? DRUMS_BD_GAIN : 0);',
      'const DRUMS_SD_GAIN = 1;',
      'const DRUMS_SD_ON = 1;',
      'const drums_sd = stack(s("~ sd ~ sd")).gain(DRUMS_SD_ON ? DRUMS_SD_GAIN : 0);',
      'const drums = stack(drums_bd, drums_sd).gain(0.8);',
      '$: drums',
    ].join('\n');

    const next = mergeGroupClips(api, code, 'drums', ['drums_bd', 'drums_sd']);

    const mergedGrid = deriveGrid(api, next, 'drums')!;
    expect(mergedGrid.rows).toEqual([
      { sample: 'bd', steps: [1, 0, 1, 0] },
      { sample: 'sd', steps: [0, 1, 0, 1] },
    ]);
    // The parent's own chain (unrelated to the split) survives.
    const parentDef = api.list(next)!.find((d) => d.name === 'drums')!;
    expect(parentDef.source).toContain('.gain(0.8)');
  });

  it('removes each member and its gate/gain consts', () => {
    const code = [
      'const DRUMS_BD_GAIN = 1;',
      'const DRUMS_BD_ON = 1;',
      'const drums_bd = stack(s("bd bd")).gain(DRUMS_BD_ON ? DRUMS_BD_GAIN : 0);',
      'const DRUMS_SD_GAIN = 1;',
      'const DRUMS_SD_ON = 1;',
      'const drums_sd = stack(s("sd sd")).gain(DRUMS_SD_ON ? DRUMS_SD_GAIN : 0);',
      'const drums = stack(drums_bd, drums_sd);',
      '$: drums',
    ].join('\n');

    const next = mergeGroupClips(api, code, 'drums', ['drums_bd', 'drums_sd']);
    const names = api.list(next)!.map((d) => d.name);

    for (const gone of [
      'drums_bd',
      'drums_sd',
      'DRUMS_BD_ON',
      'DRUMS_BD_GAIN',
      'DRUMS_SD_ON',
      'DRUMS_SD_GAIN',
    ]) {
      expect(names).not.toContain(gone);
    }
    expect(names).toContain('drums');
    // The result is a clean document — no dangling refs left behind.
    expect(api.validateGraph(api.list(next)!)).toEqual([]);
  });

  it('round-trips with splitToClips: split then merge restores the original grid content', () => {
    const code = 'const drums = stack(s("bd sd hh bd")).gain(0.8);';
    const grid = deriveGrid(api, code, 'drums')!;

    const split = splitToClips(api, code, 'drums', grid);
    const merged = mergeGroupClips(api, split, 'drums', ['drums_bd', 'drums_sd', 'drums_hh']);

    const roundTripped = deriveGrid(api, merged, 'drums')!;
    // Row order follows first appearance per member iteration order (the
    // `members` array passed in), not necessarily the original mini string —
    // documented behavior, not a bug: content is preserved, order is by
    // split-member order.
    const bySample = new Map(roundTripped.rows.map((r) => [r.sample, r.steps]));
    expect(bySample.get('bd')).toEqual([1, 0, 0, 1]);
    expect(bySample.get('sd')).toEqual([0, 1, 0, 0]);
    expect(bySample.get('hh')).toEqual([0, 0, 1, 0]);
    expect(api.validateGraph(api.list(merged)!)).toEqual([]);
  });
});
