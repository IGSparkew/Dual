/**
 * Tests for the scale system surfaced by the piano roll (`ScaleSpec`,
 * `ScaleState`, `degreeToMidi`/`midiToDegree`/`isInScale`/`nearestInScale`,
 * `readScaleState`/`writeScaleState`), and its effect on `deriveRoll`/
 * `serializeRoll`/`writeRoll`.
 *
 * Two modes coexist: "off" (default, `note("...")` — notes are absolute
 * pitches, untouched) and "on" (the clip's declaration chains
 * `.scale("Root:Type")`, its voices switch to `n("...")` — tokens are scale
 * degrees, `^-?[0-9]+$` only). Anything richer marks the clip *unmanaged*
 * (`ScaleState.kind === 'unmanaged'`) or *complex* (`deriveRoll` → null),
 * same "step back" policy as the rest of the file. Drives the real
 * `codeRegion` through the `PanelCodeApi` façade, like `piano-roll.test.ts`
 * and `piano-roll.cycles.test.ts`.
 *
 * Every midi/degree expected value below is computed from the formulas in
 * `piano-roll.ts` (`degreeToMidi`, `midiToDegree`, `nearestInScale`) in the
 * comment right above the assertion — never guessed.
 */
import { describe, it, expect } from 'vitest';
import { codeRegion } from '@core/interpreter/impl/CodeRegionImpl';
import type { PanelCodeApi } from '@layout/api/PanelApi';
import {
  deriveRoll,
  serializeRoll,
  writeRoll,
  degreeToMidi,
  midiToDegree,
  isInScale,
  nearestInScale,
  readScaleState,
  writeScaleState,
  TONAL_ROOT_NAMES,
  type PianoRoll,
  type ScaleSpec,
} from './piano-roll';

const api = codeRegion as unknown as PanelCodeApi;

// ─── deriveRoll — off (default) ──────────────────────────────────────────────

describe('deriveRoll — scale off (default, no .scale)', () => {
  it('reports scaleState off for a plain note(...) clip, notes unchanged', () => {
    const code = 'const clip = stack(note("c3 e3"));';
    const roll = deriveRoll(api, code, 'clip');
    expect(roll).not.toBeNull();
    expect(roll!.scaleState).toEqual({ kind: 'off' });
    expect(roll!.stepCount).toBe(2);
    expect(roll!.notes.map((n) => n.midi).sort((a, b) => a - b)).toEqual([48, 52]);
  });
});

// ─── deriveRoll — on, round-trip ─────────────────────────────────────────────

describe('deriveRoll — scale on, round-trip', () => {
  it('parses n(...).scale("C:major") into degrees converted to midi, reports the spec', () => {
    const code = 'const clip = stack(n("0 2 4")).scale("C:major");';
    const roll = deriveRoll(api, code, 'clip');
    expect(roll).not.toBeNull();
    expect(roll!.scaleState).toEqual({ kind: 'on', spec: { rootChroma: 0, typeId: 'major' } });
    // C major intervals = [0,2,4,5,7,9,11]; rootMidi = 48 (c3).
    // degree 0 -> 48+0=48 (c3), degree 2 -> 48+4=52 (e3), degree 4 -> 48+7=55 (g3).
    expect(roll!.notes.map((n) => n.midi).sort((a, b) => a - b)).toEqual([48, 52, 55]);
  });

  it('serializeRoll formats midi back to degrees (n(...) — .scale is clip-level, outside the roll)', () => {
    const roll: PianoRoll = {
      notes: [
        { midi: 48, step: 0, span: 1 },
        { midi: 52, step: 1, span: 1 },
        { midi: 55, step: 2, span: 1 },
      ],
      stepCount: 3,
      scaleState: { kind: 'on', spec: { rootChroma: 0, typeId: 'major' } },
    };
    expect(serializeRoll(roll)).toBe('n("0 2 4")');
  });

  it('round-trips through writeRoll: the .scale("C:major") outside the stack survives untouched', () => {
    const code = 'const clip = stack(n("0 2 4")).scale("C:major");';
    const roll = deriveRoll(api, code, 'clip')!;
    expect(writeRoll(api, code, 'clip', roll)).toBe(code);
  });
});

// ─── Octave from degree overflow ─────────────────────────────────────────────

describe('degreeToMidi — octave from degree overflow', () => {
  const spec: ScaleSpec = { rootChroma: 0, typeId: 'major' };

  it('wraps a degree >= scale length up an octave (7 = length of major)', () => {
    // idx = ((7 % 7) + 7) % 7 = 0, octaveOffset = floor(7/7) = 1
    // -> 48 (rootMidi) + intervals[0]=0 + 12*1 = 60 (c4).
    expect(degreeToMidi(spec, 7)).toBe(60);
    const roll = deriveRoll(api, 'const clip = stack(n("7")).scale("C:major");', 'clip');
    expect(roll).not.toBeNull();
    expect(roll!.notes).toEqual([{ midi: 60, step: 0, span: 1 }]);
  });

  it('wraps a negative degree down an octave (-1 = last degree of the octave below)', () => {
    // idx = ((-1 % 7) + 7) % 7 = 6, octaveOffset = floor(-1/7) = -1
    // -> 48 + intervals[6]=11 + 12*(-1) = 47 (b2).
    expect(degreeToMidi(spec, -1)).toBe(47);
    const roll = deriveRoll(api, 'const clip = stack(n("-1")).scale("C:major");', 'clip');
    expect(roll).not.toBeNull();
    expect(roll!.notes).toEqual([{ midi: 47, step: 0, span: 1 }]);
  });
});

// ─── Root with an accidental ─────────────────────────────────────────────────

describe('scale root with a sharp', () => {
  it('reads C#:minor and converts degree 0 to its tonic', () => {
    // rootChroma: C=0 + 1 (#) = 1 -> rootMidi = 48 + 1 = 49 (cs3).
    // minor intervals = [0,2,3,5,7,8,10]; degree 0 -> idx 0 -> 49 + 0 = 49.
    const code = 'const clip = stack(n("0")).scale("C#:minor");';
    const roll = deriveRoll(api, code, 'clip');
    expect(roll).not.toBeNull();
    expect(roll!.scaleState).toEqual({ kind: 'on', spec: { rootChroma: 1, typeId: 'minor' } });
    expect(roll!.notes).toEqual([{ midi: 49, step: 0, span: 1 }]);
  });
});

describe('scale root read with a flat (round-trip of a hand-written .scale)', () => {
  it('recognizes Db as rootChroma 1 (same pitch class as C#) without failing', () => {
    const code = 'const clip = stack(n("0")).scale("Db:major");';
    expect(readScaleState(api, code, 'clip')).toEqual({
      kind: 'on',
      spec: { rootChroma: 1, typeId: 'major' },
    });
    const roll = deriveRoll(api, code, 'clip');
    expect(roll).not.toBeNull();
    // rootMidi = 48 + 1 = 49 (db3/cs3); degree 0 -> 49.
    expect(roll!.notes).toEqual([{ midi: 49, step: 0, span: 1 }]);
  });
});

// ─── Degree beyond the subset ────────────────────────────────────────────────

describe('deriveRoll — degree accidental beyond the subset', () => {
  it('rejects an accidental on a degree token (n("0#")) — marks the clip complex', () => {
    const code = 'const clip = stack(n("0#")).scale("C:major");';
    expect(deriveRoll(api, code, 'clip')).toBeNull();
  });
});

// ─── Unmanaged .scale ─────────────────────────────────────────────────────────

describe('deriveRoll — unmanaged .scale (clip steps back)', () => {
  it('rejects several chained .scale links', () => {
    const code = 'const clip = stack(n("0")).scale("C:major").scale("D:minor");';
    expect(deriveRoll(api, code, 'clip')).toBeNull();
  });

  it('rejects a non-literal .scale argument (identifier)', () => {
    const code = 'const clip = stack(n("0")).scale(x);';
    expect(deriveRoll(api, code, 'clip')).toBeNull();
  });

  it('rejects an unknown scale type name', () => {
    const code = 'const clip = stack(n("0")).scale("C:bogus");';
    expect(deriveRoll(api, code, 'clip')).toBeNull();
  });
});

// ─── Callee / .scale coherence ───────────────────────────────────────────────

describe('deriveRoll — callee/.scale mismatch', () => {
  it('rejects note(...) with a .scale chained on the declaration (callee must be n)', () => {
    const code = 'const clip = stack(note("c3")).scale("C:major");';
    expect(deriveRoll(api, code, 'clip')).toBeNull();
  });

  it('rejects n(...) with no .scale at all (degrees make no sense unmanaged)', () => {
    const code = 'const clip = stack(n("0 2"));';
    expect(deriveRoll(api, code, 'clip')).toBeNull();
  });
});

// ─── readScaleState / writeScaleState ────────────────────────────────────────

describe('readScaleState', () => {
  it('mirrors deriveRoll on the mismatched/off cases above', () => {
    expect(
      readScaleState(api, 'const clip = stack(note("c3")).scale("C:major");', 'clip'),
    ).toEqual({ kind: 'on', spec: { rootChroma: 0, typeId: 'major' } });
    expect(readScaleState(api, 'const clip = stack(n("0 2"));', 'clip')).toEqual({
      kind: 'off',
    });
  });
});

describe('writeScaleState', () => {
  it('replaces an existing .scale argument in place', () => {
    const code = 'const clip = stack(n("0 2 4")).scale("C:major");';
    expect(TONAL_ROOT_NAMES[7]).toBe('G'); // rootChroma 7 -> 'G'
    const next = writeScaleState(api, code, 'clip', {
      kind: 'on',
      spec: { rootChroma: 7, typeId: 'minor' }, // G minor
    });
    expect(next).toBe('const clip = stack(n("0 2 4")).scale("G:minor");');
  });

  it('appends .scale(...) at the end of the chain when absent', () => {
    const code = 'const clip = stack(n("0 2"));';
    const next = writeScaleState(api, code, 'clip', {
      kind: 'on',
      spec: { rootChroma: 0, typeId: 'major' },
    });
    expect(next).toBe('const clip = stack(n("0 2")).scale("C:major");');
  });

  it('removes the .scale link cleanly when switching off', () => {
    const code = 'const clip = stack(n("0 2")).scale("C:major");';
    const next = writeScaleState(api, code, 'clip', { kind: 'off' });
    expect(next).toBe('const clip = stack(n("0 2"));');
  });
});

// ─── midiToDegree / isInScale / nearestInScale ───────────────────────────────

describe('midiToDegree / isInScale', () => {
  const spec: ScaleSpec = { rootChroma: 0, typeId: 'major' };

  it('midiToDegree inverts degreeToMidi for an exact tone', () => {
    expect(midiToDegree(spec, 55)).toBe(4); // g3 -> degree 4
    expect(midiToDegree(spec, 60)).toBe(7); // c4, one octave up -> degree 7
  });

  it('midiToDegree returns null for a pitch off the scale', () => {
    expect(midiToDegree(spec, 49)).toBeNull(); // cs3, not a c-major tone
  });

  it('isInScale mirrors midiToDegree', () => {
    expect(isInScale(48, spec)).toBe(true);
    expect(isInScale(49, spec)).toBe(false);
  });
});

describe('nearestInScale', () => {
  const spec: ScaleSpec = { rootChroma: 0, typeId: 'major' };

  it('returns the pitch itself when already an exact tone of the scale', () => {
    expect(nearestInScale(48, spec)).toBe(48); // c3, degree 0
  });

  it('resolves a tie by favoring the lower pitch', () => {
    // C major contains c3 (48, degree 0) and d3 (50, degree 1) around cs3
    // (49): both are 1 semitone away. nearestInScale checks `midi - d`
    // before `midi + d` for each growing distance, so the lower tone wins.
    expect(nearestInScale(49, spec)).toBe(48);
  });
});

// ─── Mixed chaining: .sound per-voice, .scale on the declaration ────────────

describe('deriveRoll — mixed chaining with .scale', () => {
  it('keeps .sound(...) per-voice while .scale(...) stays on the declaration', () => {
    const code = 'const clip = stack(n("0 2").sound("piano")).scale("C:major");';
    const roll = deriveRoll(api, code, 'clip');
    expect(roll).not.toBeNull();
    expect(roll!.chain).toBe('.sound("piano")');
    expect(roll!.scaleState).toEqual({ kind: 'on', spec: { rootChroma: 0, typeId: 'major' } });
  });
});
