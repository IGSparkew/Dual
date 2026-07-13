/**
 * Tests for the pure piano-roll model (`piano-roll.ts`).
 *
 * The roll reads/writes the *content* of a named clip — the arguments of its
 * root `stack(...)` call — through the CodeRegion façade (`PanelCodeApi`).
 * Rather than stub the façade, we drive the real `codeRegion` service: it is
 * backed by acorn + escodegen only (no `@strudel/core` barrel, which breaks
 * under Node), so it loads cleanly under vitest and exercises the exact reads
 * the panel relies on (`readExpr`, `callArgs`, `spliceSpan`, `list`).
 *
 * MIDI reference (noteToMidi, scientific octaves): c0=12, c3=48, c5=72, a4=69,
 * cs3=49, bb3=58; the roll's default octave is 3. Serialization is always
 * lowercase with `s`-sharps (`cs3`), rests `~` one per step, `tok@n` for a span
 * greater than 1, chords `[a,b]` / `[a,b]@n`.
 */
import { describe, it, expect } from 'vitest';
import { codeRegion } from '@core/interpreter/impl/CodeRegionImpl';
import type { PanelCodeApi } from '@layout/api/PanelApi';
import {
  deriveRoll,
  deriveClips,
  serializeRoll,
  writeRoll,
  noteToken,
  addNote,
  removeNote,
  moveNote,
  resizeNote,
  setStepCount,
  MIDI_MIN,
  MIDI_MAX,
  type PianoRoll,
  type RollNote,
} from './piano-roll';

// The module only ever calls the read/splice surface; the write engine is UI.
const api = codeRegion as unknown as PanelCodeApi;

/** Build a session-convention clip `const clip = stack(note("…"), …)`. */
function clipCode(...voices: string[]): string {
  const args = voices.map((v) => `note("${v}")`).join(', ');
  return `const clip = stack(${args});`;
}

/** Parse one-or-more voices straight into a roll (null when off-subset). */
function deriveVoices(...voices: string[]): PianoRoll | null {
  return deriveRoll(api, clipCode(...voices), 'clip');
}

/** MIDI pitch of the single note produced by a one-token voice. */
function midiOf(token: string): number | null {
  const roll = deriveVoices(token);
  return roll && roll.notes.length === 1 ? roll.notes[0].midi : null;
}

/** Canonical order for set comparison (parse output order is voice-dependent). */
function sortNotes(notes: RollNote[]): RollNote[] {
  return [...notes].sort((a, b) => a.step - b.step || a.midi - b.midi || a.span - b.span);
}

/** Re-parse the code produced by `serializeRoll` — the round-trip. */
function roundTrip(roll: PianoRoll): PianoRoll | null {
  const code = `const clip = stack(${serializeRoll(roll)});`;
  return deriveRoll(api, code, 'clip');
}

// ─── Pitch names ↔ midi ──────────────────────────────────────────────────────

describe('note token parsing (name → midi)', () => {
  it('maps the reference pitches on the default octave convention', () => {
    expect(midiOf('c0')).toBe(12);
    expect(midiOf('c3')).toBe(48);
    expect(midiOf('c5')).toBe(72);
    expect(midiOf('a4')).toBe(69);
    expect(midiOf('cs3')).toBe(49);
    expect(midiOf('bb3')).toBe(58);
  });

  it('defaults an octave-less name to octave 3', () => {
    expect(midiOf('c')).toBe(48);
    expect(midiOf('e')).toBe(52);
    expect(midiOf('g')).toBe(55);
  });

  it('accepts uppercase and both accidental spellings', () => {
    expect(midiOf('C#3')).toBe(49); // sharp with `#`
    expect(midiOf('cs3')).toBe(49); // sharp with `s`
    expect(midiOf('eb3')).toBe(51); // flat with `b`
    expect(midiOf('bb3')).toBe(58); // B flat
  });
});

describe('noteToken (midi → token)', () => {
  it('serializes sharps lowercase with `s` and the scientific octave', () => {
    expect(noteToken(48)).toBe('c3');
    expect(noteToken(49)).toBe('cs3');
    expect(noteToken(72)).toBe('c5');
    expect(noteToken(12)).toBe('c0');
    expect(noteToken(MIDI_MIN)).toBe('c1');
    expect(noteToken(MIDI_MAX)).toBe('c7');
  });
});

// ─── deriveRoll — the mini-notation subset ───────────────────────────────────

describe('deriveRoll (subset accepted)', () => {
  it('parses a simple line: notes + rest, step count = token count', () => {
    const roll = deriveVoices('c3 e3 g3 ~');
    expect(roll).not.toBeNull();
    expect(roll!.stepCount).toBe(4);
    expect(sortNotes(roll!.notes)).toEqual([
      { midi: 48, step: 0, span: 1 },
      { midi: 52, step: 1, span: 1 },
      { midi: 55, step: 2, span: 1 },
    ]);
  });

  it('honours a `@n` duration weight (cursor advances by the span)', () => {
    const roll = deriveVoices('c3@2 e3');
    expect(roll!.stepCount).toBe(3);
    expect(sortNotes(roll!.notes)).toEqual([
      { midi: 48, step: 0, span: 2 },
      { midi: 52, step: 2, span: 1 },
    ]);
  });

  it('advances the cursor across a weighted rest `~@2`', () => {
    const roll = deriveVoices('~@2 c3');
    expect(roll!.stepCount).toBe(3);
    expect(roll!.notes).toEqual([{ midi: 48, step: 2, span: 1 }]);
  });

  it('expands a weighted chord `[c3,e3]@2` into notes sharing step + span', () => {
    const roll = deriveVoices('[c3,e3]@2 g3');
    expect(roll!.stepCount).toBe(3);
    expect(sortNotes(roll!.notes)).toEqual([
      { midi: 48, step: 0, span: 2 },
      { midi: 52, step: 0, span: 2 },
      { midi: 55, step: 2, span: 1 },
    ]);
  });

  it('stacks several voices with equal step counts', () => {
    const roll = deriveVoices('c3 e3', 'g3 ~');
    expect(roll!.stepCount).toBe(2);
    expect(sortNotes(roll!.notes)).toEqual([
      { midi: 48, step: 0, span: 1 },
      { midi: 55, step: 0, span: 1 },
      { midi: 52, step: 1, span: 1 },
    ]);
  });

  it('keeps an out-of-display-range pitch on parse (no clamp here)', () => {
    // c0 = 12 sits below MIDI_MIN (24) — derivation never clamps, only mutations do.
    const roll = deriveVoices('c0');
    expect(roll!.notes).toEqual([{ midi: 12, step: 0, span: 1 }]);
  });
});

describe('deriveRoll (off-subset → null)', () => {
  it('rejects voices of unequal step counts (polyrhythm steps back)', () => {
    expect(deriveVoices('c3 e3', 'g3 e3 c3')).toBeNull();
  });

  it('rejects `*` repeats', () => {
    expect(deriveVoices('c3*2 e3')).toBeNull();
  });

  it('rejects `<>` alternation', () => {
    expect(deriveVoices('<c3 e3>')).toBeNull();
  });

  it('rejects nested brackets `[[...]]`', () => {
    expect(deriveVoices('[[c3,e3]]')).toBeNull();
  });

  it('rejects spaces inside a chord (sub-sequence)', () => {
    expect(deriveVoices('[c3 e3]')).toBeNull();
  });

  it('rejects a decimal duration weight `@1.5`', () => {
    expect(deriveVoices('c3@1.5')).toBeNull();
  });

  it('rejects euclid rhythms `(3,8)`', () => {
    expect(deriveVoices('c3(3,8)')).toBeNull();
  });

  it('rejects a chained argument (not a bare note call)', () => {
    const code = 'const clip = stack(note("c3").fast(2));';
    expect(deriveRoll(api, code, 'clip')).toBeNull();
  });

  it('rejects a non-note constructor (drum clip `s("bd sd")`)', () => {
    const code = 'const clip = stack(s("bd sd"));';
    expect(deriveRoll(api, code, 'clip')).toBeNull();
  });

  it('rejects a bare `s("...")` initializer', () => {
    const code = 'const clip = s("bd sd");';
    expect(deriveRoll(api, code, 'clip')).toBeNull();
  });

  it('rejects a group of named clips (identifier arguments)', () => {
    const code = 'const clip = stack(a, b);';
    expect(deriveRoll(api, code, 'clip')).toBeNull();
  });

  it('returns null when the declaration is absent', () => {
    expect(deriveRoll(api, 'const other = stack(note("c3"));', 'clip')).toBeNull();
  });
});

// ─── deriveClips ─────────────────────────────────────────────────────────────

describe('deriveClips', () => {
  const code = [
    'const drums = s("bd sd");',
    'const lead = stack(note("c3 e3"));',
    'const group = stack(lead, drums);',
    'const level = 4;',
    '$: stack(lead, drums)',
  ].join('\n');

  it('lists only const `stack(...)` declarations', () => {
    const clips = deriveClips(api, code, api.list(code)!);
    expect(clips.map((c) => c.name)).toEqual(['lead', 'group']);
  });

  it('derives the editable roll and flags the identifier group as null', () => {
    const clips = deriveClips(api, code, api.list(code)!);
    const lead = clips.find((c) => c.name === 'lead')!;
    const group = clips.find((c) => c.name === 'group')!;
    expect(lead.roll).not.toBeNull();
    expect(lead.roll!.stepCount).toBe(2);
    expect(group.roll).toBeNull();
  });
});

// ─── serializeRoll ───────────────────────────────────────────────────────────

describe('serializeRoll', () => {
  it('folds notes sharing (step, span) into one chord token', () => {
    const roll: PianoRoll = {
      notes: [
        { midi: 48, step: 0, span: 1 },
        { midi: 52, step: 0, span: 1 },
        { midi: 55, step: 0, span: 1 },
      ],
      stepCount: 4,
    };
    expect(serializeRoll(roll)).toBe('note("[c3,e3,g3] ~ ~ ~")');
  });

  it('allocates time-overlapping pitches to separate voices', () => {
    const roll: PianoRoll = {
      notes: [
        { midi: 48, step: 0, span: 2 },
        { midi: 50, step: 1, span: 2 },
      ],
      stepCount: 4,
    };
    expect(serializeRoll(roll)).toBe('note("c3@2 ~ ~"), note("~ d3@2 ~")');
  });

  it('emits `tok@n` for a span greater than one and one `~` per rest step', () => {
    const roll: PianoRoll = { notes: [{ midi: 48, step: 0, span: 3 }], stepCount: 3 };
    expect(serializeRoll(roll)).toBe('note("c3@3")');

    const gapped: PianoRoll = { notes: [{ midi: 48, step: 2, span: 1 }], stepCount: 4 };
    expect(serializeRoll(gapped)).toBe('note("~ ~ c3 ~")');
  });

  it('emits a sharp as `cs3`', () => {
    const roll: PianoRoll = { notes: [{ midi: 49, step: 0, span: 1 }], stepCount: 1 };
    expect(serializeRoll(roll)).toBe('note("cs3")');
  });

  it('serializes an empty roll as all rests', () => {
    expect(serializeRoll({ notes: [], stepCount: 4 })).toBe('note("~ ~ ~ ~")');
  });
});

// ─── Round-trip (parse → serialize → parse) ──────────────────────────────────

describe('round-trip preserves the note set', () => {
  const cases: Record<string, PianoRoll> = {
    'simple line with a rest': {
      notes: [
        { midi: 48, step: 0, span: 1 },
        { midi: 52, step: 1, span: 1 },
        { midi: 55, step: 2, span: 1 },
      ],
      stepCount: 4,
    },
    chord: {
      notes: [
        { midi: 48, step: 0, span: 2 },
        { midi: 52, step: 0, span: 2 },
        { midi: 55, step: 2, span: 1 },
      ],
      stepCount: 3,
    },
    'time-overlapping voices': {
      notes: [
        { midi: 48, step: 0, span: 3 },
        { midi: 55, step: 1, span: 1 },
        { midi: 60, step: 2, span: 2 },
      ],
      stepCount: 4,
    },
    'holes between notes': {
      notes: [
        { midi: 40, step: 1, span: 1 },
        { midi: 43, step: 5, span: 1 },
      ],
      stepCount: 8,
    },
    'out-of-range pitches kept': {
      notes: [
        { midi: 12, step: 0, span: 1 }, // below MIDI_MIN
        { midi: 108, step: 1, span: 1 }, // above MIDI_MAX
      ],
      stepCount: 4,
    },
  };

  for (const [label, roll] of Object.entries(cases)) {
    it(label, () => {
      const back = roundTrip(roll);
      expect(back).not.toBeNull();
      expect(back!.stepCount).toBe(roll.stepCount);
      expect(sortNotes(back!.notes)).toEqual(sortNotes(roll.notes));
    });
  }
});

// ─── Mutations ───────────────────────────────────────────────────────────────

describe('addNote', () => {
  const base: PianoRoll = { notes: [{ midi: 48, step: 0, span: 2 }], stepCount: 4 };

  it('adds a note within the grid', () => {
    const next = addNote(base, 52, 2, 1);
    expect(next.notes).toContainEqual({ midi: 52, step: 2, span: 1 });
    expect(next.notes).toHaveLength(2);
  });

  it('rejects a same-pitch overlap (roll unchanged)', () => {
    const next = addNote(base, 48, 1, 1); // overlaps c3 spanning [0,2)
    expect(next).toBe(base);
  });

  it('accepts a different pitch overlapping in time', () => {
    const next = addNote(base, 50, 0, 2);
    expect(next.notes).toHaveLength(2);
  });

  it('clamps the span to the end of the cycle', () => {
    const next = addNote({ notes: [], stepCount: 4 }, 60, 3, 10);
    expect(next.notes).toEqual([{ midi: 60, step: 3, span: 1 }]);
  });

  it('rejects a step outside the grid', () => {
    expect(addNote(base, 60, -1, 1)).toBe(base);
    expect(addNote(base, 60, 4, 1)).toBe(base);
  });

  it('clamps a pitch outside the display range (same policy as moveNote)', () => {
    expect(addNote(base, MIDI_MIN - 12, 3, 1).notes).toContainEqual({
      midi: MIDI_MIN,
      step: 3,
      span: 1,
    });
    expect(addNote(base, MIDI_MAX + 12, 3, 1).notes).toContainEqual({
      midi: MIDI_MAX,
      step: 3,
      span: 1,
    });
  });

  it('checks the overlap against the clamped pitch', () => {
    // c1 already sits at step 0 — adding below MIDI_MIN clamps onto it.
    const low: PianoRoll = { notes: [{ midi: MIDI_MIN, step: 0, span: 1 }], stepCount: 4 };
    expect(addNote(low, MIDI_MIN - 12, 0, 1)).toBe(low);
  });
});

describe('removeNote', () => {
  it('drops the note at the given index', () => {
    const roll: PianoRoll = {
      notes: [
        { midi: 48, step: 0, span: 1 },
        { midi: 52, step: 1, span: 1 },
      ],
      stepCount: 4,
    };
    expect(removeNote(roll, 0).notes).toEqual([{ midi: 52, step: 1, span: 1 }]);
  });

  it('is a no-op for an out-of-bounds index', () => {
    const roll: PianoRoll = { notes: [{ midi: 48, step: 0, span: 1 }], stepCount: 4 };
    expect(removeNote(roll, 5).notes).toHaveLength(1);
  });
});

describe('moveNote', () => {
  const roll: PianoRoll = {
    notes: [
      { midi: 48, step: 0, span: 1 },
      { midi: 50, step: 2, span: 2 },
    ],
    stepCount: 4,
  };

  it('moves pitch and start together', () => {
    const next = moveNote(roll, 0, 55, 1);
    expect(next.notes[0]).toEqual({ midi: 55, step: 1, span: 1 });
  });

  it('clamps the pitch to the display range', () => {
    expect(moveNote(roll, 0, MIDI_MAX + 12, 0).notes[0].midi).toBe(MIDI_MAX);
    expect(moveNote(roll, 0, MIDI_MIN - 12, 0).notes[0].midi).toBe(MIDI_MIN);
  });

  it('clamps the start so the span stays within the cycle', () => {
    // note index 1 has span 2 → max start is stepCount - span = 2.
    expect(moveNote(roll, 1, 50, 10).notes[1].step).toBe(2);
    expect(moveNote(roll, 1, 50, -5).notes[1].step).toBe(0);
  });

  it('rejects a move onto a same-pitch overlap (roll unchanged)', () => {
    const same: PianoRoll = {
      notes: [
        { midi: 48, step: 0, span: 1 },
        { midi: 50, step: 2, span: 1 },
      ],
      stepCount: 4,
    };
    // Move the second note onto c3 at step 0 — collides with note 0.
    expect(moveNote(same, 1, 48, 0)).toBe(same);
  });

  it('is a no-op for an out-of-bounds index', () => {
    expect(moveNote(roll, 9, 60, 1)).toBe(roll);
  });
});

describe('resizeNote', () => {
  const roll: PianoRoll = { notes: [{ midi: 48, step: 2, span: 1 }], stepCount: 4 };

  it('clamps the span to the end of the cycle', () => {
    expect(resizeNote(roll, 0, 10).notes[0].span).toBe(2); // stepCount - step
  });

  it('keeps a minimum span of 1', () => {
    expect(resizeNote(roll, 0, 0).notes[0].span).toBe(1);
    expect(resizeNote(roll, 0, -3).notes[0].span).toBe(1);
  });

  it('clamps the span to the next same-pitch note (no overlap)', () => {
    const two: PianoRoll = {
      notes: [
        { midi: 48, step: 0, span: 1 },
        { midi: 48, step: 2, span: 1 },
      ],
      stepCount: 8,
    };
    expect(resizeNote(two, 0, 5).notes[0].span).toBe(2);
  });

  it('a note of another pitch does not limit the resize', () => {
    const mixed: PianoRoll = {
      notes: [
        { midi: 48, step: 0, span: 1 },
        { midi: 50, step: 2, span: 1 },
      ],
      stepCount: 8,
    };
    expect(resizeNote(mixed, 0, 5).notes[0].span).toBe(5);
  });

  it('is a no-op for an out-of-bounds index', () => {
    expect(resizeNote(roll, 4, 2)).toBe(roll);
  });
});

describe('setStepCount', () => {
  it('drops notes starting beyond the new count', () => {
    const roll: PianoRoll = {
      notes: [
        { midi: 48, step: 0, span: 1 },
        { midi: 50, step: 3, span: 1 },
      ],
      stepCount: 4,
    };
    const next = setStepCount(roll, 3);
    expect(next.stepCount).toBe(3);
    expect(next.notes).toEqual([{ midi: 48, step: 0, span: 1 }]);
  });

  it('truncates a span that overruns the new count', () => {
    const roll: PianoRoll = { notes: [{ midi: 48, step: 2, span: 3 }], stepCount: 8 };
    const next = setStepCount(roll, 4);
    expect(next.notes).toEqual([{ midi: 48, step: 2, span: 2 }]);
  });
});

// ─── writeRoll (splice preserves chain + document) ───────────────────────────

describe('writeRoll', () => {
  it('splices only the stack arguments, keeping the chain intact', () => {
    const code = 'const clip = stack(note("c3 e3")).gain(0.8);';
    const roll = deriveRoll(api, code, 'clip')!;
    const next = writeRoll(api, code, 'clip', addNote(roll, 55, 1, 1));
    // e3 + g3 land on the same (step, span) → folded into a chord token.
    expect(next).toBe('const clip = stack(note("c3 [e3,g3]")).gain(0.8);');
  });

  it('leaves the surrounding document byte-for-byte intact', () => {
    const code = [
      'const other = s("bd sd");',
      'const clip = stack(note("c3 e3")).gain(0.8);',
      '$: stack(other, clip)',
    ].join('\n');
    const roll = deriveRoll(api, code, 'clip')!;
    const next = writeRoll(api, code, 'clip', setStepCount(roll, 2));
    expect(next).toBe(
      [
        'const other = s("bd sd");',
        'const clip = stack(note("c3 e3")).gain(0.8);',
        '$: stack(other, clip)',
      ].join('\n'),
    );
  });

  it('is a no-op when the clip is absent', () => {
    const code = 'const other = stack(note("c3"));';
    const roll: PianoRoll = { notes: [{ midi: 48, step: 0, span: 1 }], stepCount: 1 };
    expect(writeRoll(api, code, 'clip', roll)).toBe(code);
  });
});
