/**
 * Tests for the sound-drop writes of the session (`browser → clip`).
 *
 * A drop is applied by the session because the session owns the clip
 * convention (gate/gain consts, `NAME_BANK`). These are pure code → code
 * transforms over the real `codeRegion` façade — same setup as
 * effects.test.ts, and `write` is never touched.
 *
 * The invariant that matters beyond the generated text: a bank dropped here
 * must produce the SAME shape the drum grid reads back (`NAME_BANK` const
 * referenced by `.bank(...)`), which is what makes the grid's bank selector
 * reflect it with no synchronization code.
 */
import { describe, it, expect } from 'vitest';
import type { PanelCodeApi } from '@layout/api/PanelApi';
import type { SampleDragPayload } from '@core/types/sample-drag';
import { codeRegion } from '@core/interpreter/impl/CodeRegionImpl';
import { applyDroppedSound, bankName, insertDroppedClip, setClipBank, setClipSound } from './session';

const api = codeRegion as unknown as PanelCodeApi;

function drag(overrides: Partial<SampleDragPayload> = {}): SampleDragPayload {
  return { soundName: 'user_kick', kind: 'drum', bank: null, label: 'kick', ...overrides };
}

describe('insertDroppedClip', () => {
  const base = '$: "~"\n';

  it('creates a leaf clip seeded with a plain sample', () => {
    const next = insertDroppedClip(api, base, 'clip1', drag());
    expect(next).toContain('const CLIP1_GAIN = 1;');
    expect(next).toContain('const CLIP1_ON = 1;'); // buildLeaf's gate opens un-muted
    expect(next).toContain('const clip1 = stack(s("user_kick ~ ~ ~ ~ ~ ~ ~ ~"))');
    expect(next).toContain('.gain(CLIP1_ON ? CLIP1_GAIN : 0)');
    expect(api.list(next)).not.toBeNull(); // still parses
  });

  it('creates a pitched clip through note(...).sound(...)', () => {
    const next = insertDroppedClip(
      api,
      base,
      'clip1',
      drag({ soundName: 'user_epiano', kind: 'pitched' }),
    );
    expect(next).toContain('const clip1 = stack(note("~ ~ ~ ~ ~ ~ ~ ~").sound("user_epiano"))');
  });

  it('declares the bank const before the clip that references it', () => {
    const next = insertDroppedClip(api, base, 'clip1', drag({ bank: 'user_kit', kind: 'drum' }));
    expect(next).toContain('const CLIP1_BANK = "user_kit";');
    expect(next).toContain('const clip1 = stack(s("bd ~ ~ ~ ~ ~ ~ ~ ~").bank(CLIP1_BANK))');
    expect(next.indexOf('CLIP1_BANK =')).toBeLessThan(next.indexOf('const clip1 ='));
    expect(api.validateGraph(api.list(next)!)).toEqual([]);
  });

  it('leaves the existing document untouched', () => {
    const before = 'const other = s("bd");\n$: other\n';
    const next = insertDroppedClip(api, before, 'clip1', drag());
    expect(next).toContain('const other = s("bd");');
    expect(next).toContain('$: other');
  });
});

describe('setClipSound', () => {
  it('replaces the argument of an existing .sound(...) link', () => {
    const before = 'const a = note("c3 e3").sound("piano").gain(0.8)\n$: a\n';
    expect(setClipSound(api, before, 'a', 'user_epiano')).toBe(
      'const a = note("c3 e3").sound("user_epiano").gain(0.8)\n$: a\n',
    );
  });

  it('replaces the argument of a chained .s(...) link, keeping the alias', () => {
    const before = 'const a = note("c3").s("piano")\n$: a\n';
    expect(setClipSound(api, before, 'a', 'user_epiano')).toBe(
      'const a = note("c3").s("user_epiano")\n$: a\n',
    );
  });

  it('replaces the root constructor argument of an s(...) clip', () => {
    // chainCalls excludes the root, so this path is the fallback under test.
    const before = 'const a = s("bd").gain(0.5)\n$: a\n';
    expect(setClipSound(api, before, 'a', 'user_kick')).toBe(
      'const a = s("user_kick").gain(0.5)\n$: a\n',
    );
  });

  it('appends .sound(...) when the clip carries none', () => {
    const before = 'const a = note("c3 e3")\n$: a\n';
    expect(setClipSound(api, before, 'a', 'user_epiano')).toBe(
      'const a = note("c3 e3").sound("user_epiano")\n$: a\n',
    );
  });

  it('leaves the code alone for an unknown clip', () => {
    const before = 'const a = s("bd")\n$: a\n';
    expect(setClipSound(api, before, 'nope', 'user_kick')).toBe(before);
  });

  it('leaves the result parsable', () => {
    const before = 'const a = stack(note("c3")).gain(A_ON ? A_GAIN : 0)\n$: a\n';
    const after = setClipSound(api, before, 'a', 'user_epiano');
    expect(api.list(after)).not.toBeNull();
    expect(api.chainCalls(after, 'a')!.map((l) => l.method)).toEqual(['gain', 'sound']);
  });
});

describe('setClipBank', () => {
  it('provisions the const and its .bank(...) reference on first touch', () => {
    const before = 'const a = stack(s("bd sd"))\n$: a\n';
    const after = setClipBank(api, before, 'a', 'user_kit');
    expect(after).toBe(
      'const A_BANK = "user_kit";\nconst a = stack(s("bd sd")).bank(A_BANK)\n$: a\n',
    );
    expect(bankName('a')).toBe('A_BANK');
  });

  it('only re-values the const once provisioned — the chain is left alone', () => {
    const before = 'const A_BANK = "user_kit";\nconst a = stack(s("bd")).bank(A_BANK)\n$: a\n';
    expect(setClipBank(api, before, 'a', 'rolandtr909')).toBe(
      'const A_BANK = "rolandtr909";\nconst a = stack(s("bd")).bank(A_BANK)\n$: a\n',
    );
  });

  it('leaves the code alone for an unknown clip', () => {
    const before = 'const a = s("bd")\n$: a\n';
    expect(setClipBank(api, before, 'nope', 'user_kit')).toBe(before);
  });
});

describe('applyDroppedSound', () => {
  it('routes a bank drop to the bank machinery and a sound drop to .sound', () => {
    const before = 'const a = stack(s("bd"))\n$: a\n';
    expect(applyDroppedSound(api, before, 'a', drag({ bank: 'user_kit' }))).toContain(
      'const A_BANK = "user_kit";',
    );
    // The root callee is `stack`, not `s` — the sound is appended to the chain
    // rather than substituted into the constructor.
    expect(applyDroppedSound(api, before, 'a', drag({ soundName: 'user_kick' }))).toContain(
      'stack(s("bd")).sound("user_kick")',
    );
  });
});
