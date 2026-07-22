/**
 * Tests for the mixer's `fxBadges` — the list of FX method names chained on a
 * clip, shown as badges under its strip. Filtered on the shared `FX_METHODS`
 * contract (@core/types/fx) so non-FX chain methods (`bank`, `fast`, `gain`…)
 * never show up; deduplicated, source order kept. What each method MEANS is
 * the FX Rack's business; the mixer only reports names.
 */
import { describe, it, expect } from 'vitest';
import type { PanelCodeApi } from '@layout/api/PanelApi';
import { codeRegion } from '@core/interpreter/impl/CodeRegionImpl';
import type { NormalizedHap } from '@core/types/hap';
import { deriveStrips, deriveActivity, fxBadges } from './mixer';

const api = codeRegion as unknown as PanelCodeApi;

/** Minimal hap builder — only `locations`/`begin`/`end`/`gain` matter to `deriveActivity`. */
function hap(
  locations: Array<{ start: number; end: number }>,
  begin = 0,
  end = 0.25,
): NormalizedHap {
  return { begin, end, locations, gain: 1, sample: null, note: null, pan: 0.5 };
}

describe('fxBadges', () => {
  it('lists chained methods, excluding gain and pan', () => {
    const code = 'const A = s("bd").lpf(800).room(0.4).gain(0.8).pan(0.5)';
    expect(fxBadges(api, code, 'A')).toEqual(['lpf', 'room']);
  });

  it('deduplicates a method repeated in the chain', () => {
    const code = 'const A = s("bd").lpf(800).lpf(1000)';
    expect(fxBadges(api, code, 'A')).toEqual(['lpf']);
  });

  it('preserves source order (not any catalog order)', () => {
    const code = 'const A = s("bd").room(0.4).lpf(800).delay(0.25)';
    expect(fxBadges(api, code, 'A')).toEqual(['room', 'lpf', 'delay']);
  });

  it('returns an empty list for a clip with no chained methods', () => {
    expect(fxBadges(api, 'const A = s("bd")', 'A')).toEqual([]);
  });

  it('returns an empty list for a non-call clip (chainCalls is null)', () => {
    expect(fxBadges(api, 'const A = 5', 'A')).toEqual([]);
  });

  it('returns an empty list for an absent clip', () => {
    expect(fxBadges(api, 'const A = s("bd").lpf(800)', 'MISSING')).toEqual([]);
  });

  it('ignores non-FX chain methods (bank, fast, advanced params)', () => {
    // Only names in the shared FX_METHODS contract count as badges.
    const code = 'const A = s("bd").bank("RolandTR909").fast(2).roomfade(0.2).lpf(800)';
    expect(fxBadges(api, code, 'A')).toEqual(['lpf']);
  });

  it('recognizes FX written via read aliases (cutoff → badge)', () => {
    const code = 'const A = s("bd").cutoff(500).size(3)';
    expect(fxBadges(api, code, 'A')).toEqual(['cutoff', 'size']);
  });

  it('works on a group clip `stack(a, b)` chained with effects', () => {
    const code = 'const G = stack(A, B).room(0.5).gain(0.9)';
    expect(fxBadges(api, code, 'G')).toEqual(['room']);
  });

  it('badges compressor and the trigger-side duckorbit', () => {
    const code = 'const KICK = s("bd").compressor(-20).duckorbit(2).duckdepth(0.8)';
    expect(fxBadges(api, code, 'KICK')).toEqual(['compressor', 'duckorbit', 'duckdepth']);
  });

  it('never badges the victim `.orbit(n)` — plain routing, not an FX', () => {
    const code = 'const BASS = s("saw").orbit(2).room(0.4)';
    expect(fxBadges(api, code, 'BASS')).toEqual(['room']);
  });
});

describe('deriveActivity', () => {
  /** The strip for `name`, derived from real `Decl`s — same path the module uses. */
  function stripOf(code: string, name: string) {
    const strip = deriveStrips(api, api.list(code) ?? []).find((s) => s.name === name);
    if (!strip) throw new Error(`no strip named ${name} in: ${code}`);
    return strip;
  }

  it('attributes a single-sample hap via its one location (no regression)', () => {
    const code = 'const KICK = s("bd")';
    const loc = { start: code.indexOf('bd'), end: code.indexOf('bd') + 2 };
    const activity = deriveActivity([hap([loc])], [stripOf(code, 'KICK')]);
    expect(activity.KICK.some((v) => v > 0)).toBe(true);
  });

  it('attributes every hap of a multi-sample merged pattern', () => {
    const code = 'const DRUMS = s("bd sd hh cp")';
    const tokens = ['bd', 'sd', 'hh', 'cp'];
    const haps = tokens.map((t, i) => {
      const loc = { start: code.indexOf(t), end: code.indexOf(t) + t.length };
      return hap([loc], i * 0.25, (i + 1) * 0.25);
    });
    const activity = deriveActivity(haps, [stripOf(code, 'DRUMS')]);
    // Each token's own bucket range must carry non-zero activity.
    for (let i = 0; i < 16; i += 4) {
      expect(activity.DRUMS[i]).toBeGreaterThan(0);
    }
  });

  it('attributes a hap whose FIRST location is a `.bank(CONST)` argument outside the strip span', () => {
    // Reproduces the regression: the transpiler mini-wraps every double-quoted
    // string, including the separate `NAME_BANK` config const. Strudel's
    // combineContext concatenates the control (bank) hap's context before the
    // sample hap's, so `locations[0]` points at the bank literal — outside
    // DRUMS' own decl span — while `locations[1]` is the real sample token.
    const code = 'const DRUMS_BANK = "RolandTR909";\nconst DRUMS = s("bd sd").bank(DRUMS_BANK);';
    const bankLoc = { start: code.indexOf('RolandTR909'), end: code.indexOf('RolandTR909') + 11 };
    const sampleLoc = { start: code.indexOf('"bd sd"') + 1, end: code.indexOf('"bd sd"') + 3 };
    const strips = [stripOf(code, 'DRUMS')];

    // Sanity: the bank literal really does fall outside the DRUMS strip span —
    // otherwise this test wouldn't be exercising the regression at all.
    const drums = strips[0];
    expect(bankLoc.start < drums.start || bankLoc.start > drums.end).toBe(true);

    const activity = deriveActivity([hap([bankLoc, sampleLoc])], strips);
    expect(activity.DRUMS.some((v) => v > 0)).toBe(true);
  });

  it('drops a hap whose locations all fall outside every strip', () => {
    const code = 'const KICK = s("bd")';
    const outside = { start: code.length + 10, end: code.length + 12 };
    const activity = deriveActivity([hap([outside])], [stripOf(code, 'KICK')]);
    expect(activity.KICK.every((v) => v === 0)).toBe(true);
  });
});
