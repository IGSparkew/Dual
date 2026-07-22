/**
 * Tests for `visibleMidis` — the pitch-row layout shared by the piano roll
 * renderer and its hit test. Unfolded (`null`) it lists every semitone in
 * [MIDI_MIN, MIDI_MAX]; folded to a scale it keeps only that scale's tones,
 * top-to-bottom (descending, index 0 = highest pitch). This is what drives the
 * Ableton-style "lock scale" fold, so the invariants below (descending order,
 * exact agreement with `isInScale`) are what the geometry relies on.
 */
import { describe, it, expect } from 'vitest';
import { isInScale, MIDI_MIN, MIDI_MAX, type ScaleSpec } from './piano-roll';
import { visibleMidis } from './components/piano-roll-renderer';

// ─── Unfolded (no scale) ─────────────────────────────────────────────────────

describe('visibleMidis — unfolded (null)', () => {
  it('lists every semitone in range, descending', () => {
    const rows = visibleMidis(null);
    // MIDI_MAX (96, c7) down to MIDI_MIN (24, c1) inclusive.
    expect(rows.length).toBe(MIDI_MAX - MIDI_MIN + 1);
    expect(rows[0]).toBe(MIDI_MAX);
    expect(rows[rows.length - 1]).toBe(MIDI_MIN);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]).toBe(rows[i - 1] - 1); // strictly descending by 1
    }
  });
});

// ─── Folded to a scale ───────────────────────────────────────────────────────

describe('visibleMidis — folded to a scale', () => {
  const spec: ScaleSpec = { rootChroma: 0, typeId: 'major' }; // C major

  it('keeps only in-scale pitches, descending, agreeing with isInScale', () => {
    const rows = visibleMidis(spec);
    // The fold is exactly the unfolded range filtered by isInScale.
    const expected = visibleMidis(null).filter((m) => isInScale(m, spec));
    expect(rows).toEqual(expected);
    // Every row is a scale tone, strictly descending, no duplicates.
    for (let i = 0; i < rows.length; i++) {
      expect(isInScale(rows[i], spec)).toBe(true);
      if (i > 0) expect(rows[i]).toBeLessThan(rows[i - 1]);
    }
  });

  it('includes c3/c4 (scale tones) and drops cs3 (off the scale)', () => {
    const rows = visibleMidis(spec);
    expect(rows).toContain(48); // c3, degree 0
    expect(rows).toContain(60); // c4, degree 7
    expect(rows).not.toContain(49); // cs3, not a C-major tone
  });

  it('has one row per octave for a scale of length 7 within a 12-semitone span', () => {
    const rows = visibleMidis(spec);
    // C major has 7 tones per octave; the row count matches that of the
    // filtered range (cross-checked above), here spelled out per full octave.
    const inOctave = rows.filter((m) => m >= 48 && m < 60); // c3..b3
    expect(inOctave.length).toBe(7);
  });
});
