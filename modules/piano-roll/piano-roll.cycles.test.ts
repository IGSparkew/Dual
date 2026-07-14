/**
 * Tests for the « Mesures » loop length surfaced by the piano roll
 * (`PianoRoll.cycles`, derived through `readCycles` in `deriveRoll`).
 *
 * A clip-level `.slow(n)` lives OUTSIDE the root `stack(...)` whose arguments
 * the roll edits, so the notes are always parsed as usual; only `cycles`
 * reflects the (un)managed loop-length link. Drives the real `codeRegion`
 * through the `PanelCodeApi` façade, like `piano-roll.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { codeRegion } from '@core/interpreter/impl/CodeRegionImpl';
import type { PanelCodeApi } from '@layout/api/PanelApi';
import { deriveRoll } from './piano-roll';

const api = codeRegion as unknown as PanelCodeApi;

describe('deriveRoll — cycles (loop length)', () => {
  it('defaults to 1 cycle with no .slow, notes still derived', () => {
    const roll = deriveRoll(api, 'const clip = stack(note("c3 e3 g3"));', 'clip');
    expect(roll).not.toBeNull();
    expect(roll!.cycles).toBe(1);
    expect(roll!.stepCount).toBe(3);
    expect(roll!.notes).toHaveLength(3);
  });

  it('reports the .slow(n) factor while keeping the notes editable', () => {
    const roll = deriveRoll(api, 'const clip = stack(note("c3 e3")).slow(2);', 'clip');
    expect(roll).not.toBeNull();
    expect(roll!.cycles).toBe(2);
    expect(roll!.stepCount).toBe(2);
    expect(roll!.notes.map((n) => n.midi).sort((a, b) => a - b)).toEqual([48, 52]);
  });

  it('reads a mid-chain .slow (before the clip gate)', () => {
    const code =
      'const clip = stack(note("c4 ~").sound("piano")).slow(4).gain(CLIP_ON ? CLIP_GAIN : 0);';
    const roll = deriveRoll(api, code, 'clip');
    expect(roll).not.toBeNull();
    expect(roll!.cycles).toBe(4);
    expect(roll!.chain).toBe('.sound("piano")'); // voice-level chain unaffected
  });

  it('exposes cycles null for an unmanaged .slow(sine) but still derives the notes', () => {
    const roll = deriveRoll(api, 'const clip = stack(note("c3 e3")).slow(sine);', 'clip');
    expect(roll).not.toBeNull();
    expect(roll!.cycles).toBeNull();
    expect(roll!.notes).toHaveLength(2);
  });

  it('exposes cycles null for a decimal .slow(1.5)', () => {
    const roll = deriveRoll(api, 'const clip = stack(note("c3")).slow(1.5);', 'clip');
    expect(roll).not.toBeNull();
    expect(roll!.cycles).toBeNull();
  });
});
