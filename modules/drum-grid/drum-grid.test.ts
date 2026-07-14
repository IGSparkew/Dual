/**
 * Tests for the bank-availability helpers of the drum grid
 * (`deriveBankChoices`, `missingRowSamples`) and the « Mesures » loop length
 * surfaced by `deriveGrid` (`DrumGrid.cycles`).
 *
 * Context: superdough lowercases every sound-map key on registration
 * (`RolandTR909_bd` → `rolandtr909_bd`) and machine sounds split on their
 * LAST `_`. Partial kits are common (RolandSH09 only ships `bd`), which was
 * the original bug: the grid offered instruments the bank cannot play.
 */
import { describe, it, expect } from 'vitest';
import { codeRegion } from '@core/interpreter/impl/CodeRegionImpl';
import type { PanelCodeApi } from '@layout/api/PanelApi';
import {
  deriveBankChoices,
  deriveGrid,
  missingRowSamples,
  DRUM_BANKS,
  type DrumGrid,
} from './drum-grid';

// The grid only calls the read/splice surface; the write engine is UI.
const api = codeRegion as unknown as PanelCodeApi;

/** Build a grid whose rows carry the given samples (steps are irrelevant here). */
function makeGrid(samples: string[], stepCount = 4): DrumGrid {
  return {
    rows: samples.map((sample) => ({
      sample,
      steps: new Array<number>(stepCount).fill(0),
    })),
    stepCount,
    form: 'merged',
  };
}

describe('deriveBankChoices', () => {
  it('returns the full DRUM_BANKS list with empty missing while sounds are empty (packs loading)', () => {
    const choices = deriveBankChoices([], makeGrid(['bd', 'sd']));
    expect(choices.map((c) => c.name)).toEqual(DRUM_BANKS);
    expect(choices.every((c) => c.missing.length === 0)).toBe(true);
  });

  it('reports the grid instruments a partial kit does not cover', () => {
    const sounds = ['rolandsh09_bd', 'rolandtr909_bd', 'rolandtr909_sd'];
    const choices = deriveBankChoices(sounds, makeGrid(['bd', 'sd']));

    const sh09 = choices.find((c) => c.name === 'RolandSH09');
    const tr909 = choices.find((c) => c.name === 'RolandTR909');
    expect(sh09).toBeDefined();
    expect(tr909).toBeDefined();
    expect(sh09!.missing).toEqual(['sd']);
    expect(tr909!.missing).toEqual([]);
  });

  it('filters out DRUM_BANKS machines absent from the registered sounds', () => {
    const sounds = ['rolandsh09_bd', 'rolandtr909_bd', 'rolandtr909_sd'];
    const choices = deriveBankChoices(sounds, makeGrid(['bd']));
    // Only the two machines actually present remain — no RolandTR808 etc.
    expect(choices.map((c) => c.name)).toEqual(['RolandSH09', 'RolandTR909']);
  });

  it('appends unknown prefixes (user packs) after the known banks, as-is', () => {
    const sounds = ['rolandtr909_bd', 'mykit_bd', 'akit_sd'];
    const choices = deriveBankChoices(sounds, makeGrid(['bd']));
    // Known bank first (canonical casing), then discovered machines sorted
    // alphabetically and displayed lowercase as found in the sound map.
    expect(choices.map((c) => c.name)).toEqual(['RolandTR909', 'akit', 'mykit']);
    const mykit = choices.find((c) => c.name === 'mykit')!;
    expect(mykit.missing).toEqual([]);
  });

  it('filters out underscored non-machine names (vcsl.json) from discovered prefixes', () => {
    // vcsl.json (loaded by default) registers ~60 underscored keys like these;
    // each would otherwise become an unusable pseudo-bank. A discovered prefix
    // is kept only when its kit covers at least one DRUM_SAMPLES instrument.
    const sounds = [
      'recorder_alto',
      'recorder_bass',
      'pipeorgan_loud',
      'pipeorgan_quiet',
      'snare_modern',
      'mykit_bd', // real user kit — kept
      'rolandtr909_bd', // DRUM_BANKS — exempt from the filter
    ];
    const choices = deriveBankChoices(sounds, makeGrid(['bd']));
    expect(choices.map((c) => c.name)).toEqual(['RolandTR909', 'mykit']);
  });

  it('preserves the DRUM_BANKS display casing for known machines', () => {
    const choices = deriveBankChoices(['rolandsh09_bd'], null);
    expect(choices.map((c) => c.name)).toEqual(['RolandSH09']);
    expect(choices.map((c) => c.name)).not.toContain('rolandsh09');
  });

  it('resolves a row sample with an index suffix to its instrument (`hh:2` → `hh`)', () => {
    const sounds = ['rolandtr909_hh', 'rolandtr909_bd'];
    const choices = deriveBankChoices(sounds, makeGrid(['hh:2', 'bd']));
    expect(choices[0].name).toBe('RolandTR909');
    expect(choices[0].missing).toEqual([]);

    // Same suffix against a kit lacking `hh`: the missing entry is the
    // instrument, not the raw row sample.
    const partial = deriveBankChoices(['rolandsh09_bd'], makeGrid(['hh:2']));
    expect(partial[0].missing).toEqual(['hh']);
  });

  it('ignores sound names without `_` when building machine kits', () => {
    // Dirt-Samples style flat names must not become machines.
    const choices = deriveBankChoices(['bd', 'sd', 'hh'], makeGrid(['bd']));
    expect(choices).toEqual([]);
  });

  it('splits sound names on their LAST `_` (`my_kit_bd` → machine my_kit, instrument bd)', () => {
    const choices = deriveBankChoices(['my_kit_bd', 'my_kit_sd'], makeGrid(['bd', 'sd', 'oh']));
    expect(choices.map((c) => c.name)).toEqual(['my_kit']);
    expect(choices[0].missing).toEqual(['oh']);
  });

  it('yields empty missing lists when the grid is null (no clip selected)', () => {
    const choices = deriveBankChoices(['rolandsh09_bd', 'rolandtr909_sd'], null);
    expect(choices.length).toBeGreaterThan(0);
    expect(choices.every((c) => c.missing.length === 0)).toBe(true);
  });

  it('compares bank availability case-insensitively (uppercase sounds still match)', () => {
    // Defensive: sound maps are lowercase in practice, but the check must not
    // depend on it.
    const choices = deriveBankChoices(['RolandTR909_BD'], makeGrid(['bd']));
    expect(choices.map((c) => c.name)).toEqual(['RolandTR909']);
    expect(choices[0].missing).toEqual([]);
  });

  it('does not duplicate an instrument shared by several rows', () => {
    const choices = deriveBankChoices(['rolandsh09_bd'], makeGrid(['hh', 'hh:2', 'hh:3']));
    expect(choices[0].missing).toEqual(['hh']);
  });
});

describe('missingRowSamples', () => {
  it('looks up `${bank}_${instrument}` in lowercase when a bank is set', () => {
    const sounds = ['rolandtr909_bd', 'rolandtr909_sd'];
    const grid = makeGrid(['bd', 'sd', 'oh']);
    const missing = missingRowSamples(sounds, grid, 'RolandTR909');
    expect(missing).toEqual(new Set(['oh']));
  });

  it('looks up the bare instrument name when no bank is set', () => {
    // Dirt-Samples style sound map: flat names.
    const sounds = ['bd', 'sd', 'hh'];
    const grid = makeGrid(['bd', 'sd', 'cp']);
    const missing = missingRowSamples(sounds, grid, null);
    expect(missing).toEqual(new Set(['cp']));
  });

  it('returns an empty set while sounds are empty (packs loading — no false negatives)', () => {
    const grid = makeGrid(['bd', 'sd']);
    expect(missingRowSamples([], grid, 'RolandTR909')).toEqual(new Set());
    expect(missingRowSamples([], grid, null)).toEqual(new Set());
  });

  it('resolves `hh:2` through its instrument `hh`', () => {
    const missing = missingRowSamples(['hh', 'bd'], makeGrid(['hh:2', 'bd']), null);
    expect(missing).toEqual(new Set());
  });

  it('reports the ORIGINAL row sample (`hh:2`), not the resolved instrument', () => {
    const missing = missingRowSamples(['bd'], makeGrid(['hh:2', 'bd']), null);
    expect(missing).toEqual(new Set(['hh:2']));
    expect(missing.has('hh')).toBe(false);
  });

  it('matches the bank case-insensitively against the lowercase sound map', () => {
    const missing = missingRowSamples(['rolandsh09_bd'], makeGrid(['bd']), 'RolandSH09');
    expect(missing).toEqual(new Set());
  });
});

describe('original bug: RolandSH09 only ships bd', () => {
  const sounds = ['rolandsh09_bd'];
  const grid = makeGrid(['bd', 'sd', 'oh', 'cp']);

  it('deriveBankChoices flags sd/oh/cp as missing for RolandSH09', () => {
    const choices = deriveBankChoices(sounds, grid);
    expect(choices.map((c) => c.name)).toEqual(['RolandSH09']);
    expect(choices[0].missing).toEqual(['sd', 'oh', 'cp']);
  });

  it('missingRowSamples flags the sd/oh/cp rows with the bank applied', () => {
    const missing = missingRowSamples(sounds, grid, 'RolandSH09');
    expect(missing).toEqual(new Set(['sd', 'oh', 'cp']));
    expect(missing.has('bd')).toBe(false);
  });
});

// ─── « Mesures » loop length (DrumGrid.cycles via deriveGrid) ─────────────────
// The grid content stays editable regardless of the loop length: a clip-level
// `.slow(n)` lives outside the `stack(...)` args deriveGrid reads, so the rows
// are always parsed; only `cycles` reflects the (un)managed link.

describe('deriveGrid — cycles (loop length)', () => {
  it('defaults to 1 cycle when there is no .slow, rows still derived', () => {
    const grid = deriveGrid(api, 'const clip = stack(s("bd sd"));', 'clip');
    expect(grid).not.toBeNull();
    expect(grid!.cycles).toBe(1);
    expect(grid!.rows.map((r) => r.sample)).toEqual(['bd', 'sd']);
    expect(grid!.stepCount).toBe(2);
  });

  it('reports the .slow(n) factor while keeping the pattern editable', () => {
    const grid = deriveGrid(api, 'const clip = stack(s("bd sd hh")).slow(2);', 'clip');
    expect(grid).not.toBeNull();
    expect(grid!.cycles).toBe(2);
    expect(grid!.rows.map((r) => r.sample)).toEqual(['bd', 'sd', 'hh']);
    expect(grid!.stepCount).toBe(3);
  });

  it('exposes cycles null for an unmanaged .slow(sine) but still derives the rows', () => {
    const grid = deriveGrid(api, 'const clip = stack(s("bd sd")).slow(sine);', 'clip');
    expect(grid).not.toBeNull();
    expect(grid!.cycles).toBeNull();
    expect(grid!.rows.map((r) => r.sample)).toEqual(['bd', 'sd']);
  });

  it('reads the loop length alongside a bank chain (.slow after .bank)', () => {
    const code = 'const clip = stack(s("bd sd")).bank("RolandTR909").slow(4);';
    const grid = deriveGrid(api, code, 'clip');
    expect(grid!.cycles).toBe(4);
    expect(grid!.rows.map((r) => r.sample)).toEqual(['bd', 'sd']);
  });
});
