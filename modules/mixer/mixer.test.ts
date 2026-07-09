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
import { fxBadges } from './mixer';

const api = codeRegion as unknown as PanelCodeApi;

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
