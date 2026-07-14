/**
 * Tests for the « Mesures » loop-length helpers (`readCycles`, `writeCycles`,
 * `rescaleStepCount`, `loopPhase`).
 *
 * A loop of n measures is a single managed `.slow(n)` link chained on the
 * clip's initializer. These helpers own that one link; anything richer (several
 * `.slow`, a non-literal or decimal argument, a missing/non-call declaration)
 * is unmanaged — reads return null and writes are no-ops.
 *
 * Like the piano-roll/drum-grid suites we drive the REAL `codeRegion` (acorn +
 * escodegen, no `@strudel/core` barrel) through the `PanelCodeApi` façade, so
 * `chainCalls`/`list`/`spliceSpan` are exercised exactly as the modules use them.
 *
 * `rescaleStepCount` / `loopPhase` are pure numeric helpers: `rescaleStepCount`
 * re-scales a step count when switching loop length (from/to always come from
 * CYCLE_CHOICES, i.e. integers ≥ 1), and `loopPhase` maps the transport
 * position (beats) to a [0, 1) playhead phase (cycles always resolved with
 * `?? 1`, so ≥ 1). We only assert what the modules can actually reach.
 */
import { describe, it, expect } from 'vitest';
import { codeRegion } from '@core/interpreter/impl/CodeRegionImpl';
import type { PanelCodeApi } from '@layout/api/PanelApi';
import { CYCLE_CHOICES, readCycles, writeCycles, rescaleStepCount, loopPhase } from './loop-length';

const api = codeRegion as unknown as PanelCodeApi;

/** A drum-style clip `const clip = <init>;` — the initializer carries the chain. */
function clip(init: string): string {
  return `const clip = ${init};`;
}

// ─── CYCLE_CHOICES ───────────────────────────────────────────────────────────

describe('CYCLE_CHOICES', () => {
  it('offers the powers of two 1, 2, 4, 8', () => {
    expect([...CYCLE_CHOICES]).toEqual([1, 2, 4, 8]);
  });
});

// ─── readCycles ──────────────────────────────────────────────────────────────

describe('readCycles', () => {
  it('reads 1 when there is no .slow link', () => {
    expect(readCycles(api, clip('stack(s("bd sd"))'), 'clip')).toBe(1);
  });

  it('reads 1 for a bare constructor with an empty chain', () => {
    // chainCalls returns [] (no links) — still one cycle, not null.
    expect(readCycles(api, clip('s("bd sd")'), 'clip')).toBe(1);
  });

  it('reads the integer factor of a single trailing .slow', () => {
    expect(readCycles(api, clip('stack(s("bd sd")).slow(2)'), 'clip')).toBe(2);
    expect(readCycles(api, clip('stack(s("bd sd")).slow(8)'), 'clip')).toBe(8);
  });

  it('reads .slow found in the middle of a longer chain', () => {
    const code = clip('stack(s("bd sd")).slow(2).gain(0.5)');
    expect(readCycles(api, code, 'clip')).toBe(2);
  });

  it('reads .slow appearing before another link', () => {
    const code = clip('stack(s("bd sd")).gain(0.5).slow(4)');
    expect(readCycles(api, code, 'clip')).toBe(4);
  });

  it('returns null for a non-literal argument (.slow(sine))', () => {
    expect(readCycles(api, clip('stack(s("bd sd")).slow(sine)'), 'clip')).toBeNull();
  });

  it('returns null for a decimal factor (.slow(1.5))', () => {
    expect(readCycles(api, clip('stack(s("bd sd")).slow(1.5)'), 'clip')).toBeNull();
  });

  it('returns null for a factor below 1 (.slow(0))', () => {
    expect(readCycles(api, clip('stack(s("bd sd")).slow(0)'), 'clip')).toBeNull();
  });

  it('returns null when two .slow links are present', () => {
    expect(readCycles(api, clip('stack(s("bd sd")).slow(2).slow(4)'), 'clip')).toBeNull();
  });

  it('returns null when .slow carries more than one argument', () => {
    expect(readCycles(api, clip('stack(s("bd sd")).slow(2, 3)'), 'clip')).toBeNull();
  });

  it('returns null when the declaration is absent', () => {
    expect(readCycles(api, clip('stack(s("bd sd"))'), 'other')).toBeNull();
  });

  it('returns null when the initializer is not a call (plain value)', () => {
    expect(readCycles(api, 'const clip = 4;', 'clip')).toBeNull();
  });
});

// ─── writeCycles ─────────────────────────────────────────────────────────────

describe('writeCycles', () => {
  it('appends .slow(n) at the end of an existing chain', () => {
    const code = clip('stack(s("bd sd")).gain(0.5)');
    expect(writeCycles(api, code, 'clip', 2)).toBe(
      clip('stack(s("bd sd")).gain(0.5).slow(2)'),
    );
  });

  it('appends .slow(n) to a bare initializer that had no chain', () => {
    const code = clip('stack(s("bd sd"))');
    expect(writeCycles(api, code, 'clip', 4)).toBe(clip('stack(s("bd sd")).slow(4)'));
  });

  it('updates the factor in place, touching nothing else', () => {
    const code = clip('stack(s("bd sd")).slow(2)');
    expect(writeCycles(api, code, 'clip', 4)).toBe(clip('stack(s("bd sd")).slow(4)'));
  });

  it('updates a mid-chain .slow while keeping the trailing links intact', () => {
    const code = clip('stack(s("bd sd")).slow(2).gain(0.5)');
    expect(writeCycles(api, code, 'clip', 8)).toBe(
      clip('stack(s("bd sd")).slow(8).gain(0.5)'),
    );
  });

  it('removes the whole link when cycles is 1 (no text residue)', () => {
    const code = clip('stack(s("bd sd")).slow(2)');
    expect(writeCycles(api, code, 'clip', 1)).toBe(clip('stack(s("bd sd"))'));
  });

  it('removes a mid-chain .slow for cycles 1, leaving the other links', () => {
    const code = clip('stack(s("bd sd")).slow(2).gain(0.5)');
    expect(writeCycles(api, code, 'clip', 1)).toBe(clip('stack(s("bd sd")).gain(0.5)'));
  });

  it('is a no-op when the requested length already matches', () => {
    const two = clip('stack(s("bd sd")).slow(2)');
    expect(writeCycles(api, two, 'clip', 2)).toBe(two);
    const one = clip('stack(s("bd sd"))');
    expect(writeCycles(api, one, 'clip', 1)).toBe(one);
  });

  it('is a no-op on an unmanaged clip (.slow(sine))', () => {
    const code = clip('stack(s("bd sd")).slow(sine)');
    expect(writeCycles(api, code, 'clip', 4)).toBe(code);
  });

  it('is a no-op when the declaration is absent', () => {
    const code = clip('stack(s("bd sd"))');
    expect(writeCycles(api, code, 'other', 2)).toBe(code);
  });

  it('leaves neighbouring declarations byte-for-byte intact', () => {
    const code = [
      'const other = s("hh*4");',
      'const clip = stack(s("bd sd")).gain(0.5);',
      '$: stack(other, clip)',
    ].join('\n');
    const next = writeCycles(api, code, 'clip', 2);
    expect(next).toBe(
      [
        'const other = s("hh*4");',
        'const clip = stack(s("bd sd")).gain(0.5).slow(2);',
        '$: stack(other, clip)',
      ].join('\n'),
    );
  });
});

// ─── round-trip & parsability ────────────────────────────────────────────────

describe('write then read round-trips', () => {
  for (const cycles of [2, 4, 8]) {
    it(`writes .slow(${cycles}) and reads it back`, () => {
      const written = writeCycles(api, clip('stack(s("bd sd"))'), 'clip', cycles);
      expect(readCycles(api, written, 'clip')).toBe(cycles);
    });
  }

  it('round-trips through 1 back to a managed one-cycle clip', () => {
    const four = writeCycles(api, clip('stack(s("bd sd"))'), 'clip', 4);
    const back = writeCycles(api, four, 'clip', 1);
    expect(back).toBe(clip('stack(s("bd sd"))'));
    expect(readCycles(api, back, 'clip')).toBe(1);
  });
});

describe('the result stays parsable', () => {
  it('keeps list()/chainCalls coherent after an append', () => {
    const after = writeCycles(api, clip('stack(s("bd sd")).gain(0.5)'), 'clip', 2);
    expect(api.list(after)).not.toBeNull();
    const links = api.chainCalls(after, 'clip')!;
    expect(links.map((l) => l.method)).toEqual(['gain', 'slow']);
    expect(links.find((l) => l.method === 'slow')!.args.map((a) => a.source)).toEqual(['2']);
  });

  it('keeps list()/chainCalls coherent after a removal (no slow left)', () => {
    const after = writeCycles(api, clip('stack(s("bd sd")).slow(2).gain(0.5)'), 'clip', 1);
    expect(api.list(after)).not.toBeNull();
    const links = api.chainCalls(after, 'clip')!;
    expect(links.map((l) => l.method)).toEqual(['gain']);
  });
});

// ─── rescaleStepCount ────────────────────────────────────────────────────────

describe('rescaleStepCount', () => {
  it('extends a divisible count keeping per-step duration (16, 1→2 = 32)', () => {
    expect(rescaleStepCount(16, 1, 2)).toBe(32);
  });

  it('reduces a divisible count keeping per-step duration (32, 4→2 = 16)', () => {
    expect(rescaleStepCount(32, 4, 2)).toBe(16);
  });

  it('leaves a count that is not divisible by `from` unchanged (15, 2→4 = 15)', () => {
    expect(rescaleStepCount(15, 2, 4)).toBe(15);
  });

  it('leaves the count unchanged when a reduction would be fractional (16, 3→2 = 16)', () => {
    // 16 % 3 !== 0 — the content is left alone, only the `.slow` factor moves.
    expect(rescaleStepCount(16, 3, 2)).toBe(16);
  });

  it('is the identity when from === to on a divisible count (16, 2→2 = 16)', () => {
    expect(rescaleStepCount(16, 2, 2)).toBe(16);
  });

  it('is the identity when from === to on a non-divisible count (15, 2→2 = 15)', () => {
    expect(rescaleStepCount(15, 2, 2)).toBe(15);
  });

  it('is the identity when from === to === 1 (the base one-cycle case)', () => {
    expect(rescaleStepCount(15, 1, 1)).toBe(15);
    expect(rescaleStepCount(16, 1, 1)).toBe(16);
  });

  it('scales cleanly across the full CYCLE_CHOICES range (8 steps/cycle)', () => {
    // A clip of 8 steps per cycle grows/shrinks proportionally to the loop length.
    expect(rescaleStepCount(8, 1, 8)).toBe(64);
    expect(rescaleStepCount(64, 8, 1)).toBe(8);
    expect(rescaleStepCount(32, 8, 2)).toBe(8);
  });

  it('keeps 0 steps at 0 (empty pattern stays empty)', () => {
    expect(rescaleStepCount(0, 2, 4)).toBe(0);
  });

  it('reduction then extension round-trips a divisible count', () => {
    // 16 over 2 cycles → 1 cycle (8) → back to 2 cycles (16).
    const reduced = rescaleStepCount(16, 2, 1);
    expect(reduced).toBe(8);
    expect(rescaleStepCount(reduced, 1, 2)).toBe(16);
  });
});

// ─── loopPhase ───────────────────────────────────────────────────────────────

describe('loopPhase', () => {
  it('is 0 at the start of the loop', () => {
    expect(loopPhase(0, 1)).toBe(0);
  });

  it('maps 1 beat of a 1-cycle loop to a quarter phase (0.25)', () => {
    expect(loopPhase(1, 1)).toBe(0.25);
  });

  it('wraps a full cycle back to 0 (4 beats / 1 cycle)', () => {
    expect(loopPhase(4, 1)).toBe(0);
  });

  it('maps 4 beats of a 2-cycle loop to the midpoint (0.5)', () => {
    expect(loopPhase(4, 2)).toBe(0.5);
  });

  it('wraps a slightly-negative position into [0, 1) (−1 beat / 1 cycle → 0.75)', () => {
    // Cycle-clock jitter right after start yields small negatives; the double
    // modulo keeps the phase positive instead of returning a negative number.
    expect(loopPhase(-1, 1)).toBe(0.75);
  });

  it('wraps a full 2-cycle loop (8 beats) back to 0', () => {
    expect(loopPhase(8, 2)).toBe(0);
  });

  it('places three-quarters through a 2-cycle loop (6 beats / 2 cycles → 0.75)', () => {
    expect(loopPhase(6, 2)).toBe(0.75);
  });

  it('places the midpoint of a 1-cycle loop (2 beats → 0.5)', () => {
    expect(loopPhase(2, 1)).toBe(0.5);
  });

  it('keeps a tiny negative jitter strictly below 1 and at/above 0', () => {
    const phase = loopPhase(-0.0001, 1);
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(phase).toBeLessThan(1);
  });

  it('always returns a phase within [0, 1) across the CYCLE_CHOICES', () => {
    for (const cycles of CYCLE_CHOICES) {
      for (const beats of [-2, -0.5, 0, 0.3, 3, 7.99, 31]) {
        const phase = loopPhase(beats, cycles);
        expect(phase).toBeGreaterThanOrEqual(0);
        expect(phase).toBeLessThan(1);
      }
    }
  });
});
