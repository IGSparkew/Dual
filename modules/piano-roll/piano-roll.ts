/**
 * Piano roll model — pure helpers over the CodeRegion façade.
 *
 * The roll edits the *content* of a named clip (the arguments of its root
 * `stack(...)` call), never the gain/fx chain or the rest of the document.
 * Every argument must be a `note("...")` — optionally followed by a method
 * chain (`.sound("piano")`…) shared verbatim by every voice, preserved on
 * write — within a deliberate subset of mini-notation:
 *
 *   - rests: `~` (and `~@n` on parse, n integer)
 *   - notes: `c3`, `cs3@2` — `@n` is the relative duration weight (integer ≥ 1)
 *   - chords: `[c3,e3,g3]` or `[c3,e3]@2` — commas only, no spaces inside
 *
 * Anything richer (`*`, `<>`, nesting, euclid, decimals…) marks the clip as
 * *complex* and the panel steps back — same policy as the drum grid.
 *
 * Each `note(...)` line is one voice: the cursor advances by the token's span
 * (rests included) and the total weight is the line's step count. All voices
 * of a stack must share the same step count (polyrhythm steps back).
 */
import { noteToMidi } from '@strudel/core/util.mjs';
import type { PanelCodeApi } from '@layout/api/PanelApi';
import type { Decl } from '@core/interpreter/CodeRegion';
import { miniOf, splitChain, tokenize } from '@modules/shared/mini-notation';
import { readCycles } from '@modules/shared/loop-length';

// ─── Model ───────────────────────────────────────────────────────────────────

export interface RollNote {
  /** MIDI pitch (c3 = 48, scientific convention of noteToMidi). */
  midi: number;
  /** Start step within the cycle. */
  step: number;
  /** Duration weight in steps (`@n`, 1 when omitted). */
  span: number;
}

export interface PianoRoll {
  notes: RollNote[];
  /** Total duration weight of one voice — shared by every voice of the stack. */
  stepCount: number;
  /** Method chain carried by every voice (`.sound("piano")`), `''` when bare.
   *  Voices with differing chains mark the clip complex — a rewrite reallocates
   *  the voices, so a per-voice chain could not survive it. */
  chain?: string;
  /** Loop length in cycles, read from the clip's chained `.slow(n)` — 1 when
   *  absent (and when the field is omitted, e.g. bare test fixtures). null =
   *  an unmanaged `.slow` (non-literal, decimal, duplicated): the « Mesures »
   *  select is disabled and `writeCycles` keeps hands off. */
  cycles?: number | null;
}

/** A clip as the piano roll sees it; `roll` is null when the content is beyond
 *  the roll's mini-notation subset (the panel shows it as non-editable). */
export interface RollClip {
  name: string;
  roll: PianoRoll | null;
}

export const STEP_CHOICES = [8, 16, 32, 64] as const;

/** Displayed pitch range: c1 (24) up to c7 (96). */
export const MIDI_MIN = 24;
export const MIDI_MAX = 96;

// ─── Note tokens (name ↔ midi) ───────────────────────────────────────────────

/** Mini-notation note name: letter, accidentals (`#`/`s` sharp, `b`/`f` flat,
 *  cumulable), optional signed octave (`bb3` = B flat 3). */
const NOTE_RE = /^[a-gA-G][#bsf]*-?[0-9]*$/;

/** Serialized chromatic scale — lowercase, sharps as `s` (`cs3`). */
const CHROMATIC = ['c', 'cs', 'd', 'ds', 'e', 'f', 'fs', 'g', 'gs', 'a', 'as', 'b'];

/** midi → mini-notation token (49 → `cs3`); octave = floor(midi / 12) - 1. */
export function noteToken(midi: number): string {
  const chroma = ((midi % 12) + 12) % 12;
  return `${CHROMATIC[chroma]}${Math.floor(midi / 12) - 1}`;
}

/** Parse a note token to midi, null when beyond the subset. Guarded by the
 *  regex — noteToMidi throws on anything else. Default octave is 3. */
function tokenToMidi(token: string): number | null {
  if (!NOTE_RE.test(token)) return null;
  return noteToMidi(token);
}

// ─── Mini-notation subset (parse) ────────────────────────────────────────────

/** One parsed step token: a rest or a set of simultaneous pitches. */
type StepToken = { midis: number[]; span: number };

/** Split off a trailing `@n` weight. Integer ≥ 1 only — a decimal or anything
 *  else after `@` is beyond the subset (null). */
function splitSpan(token: string): { body: string; span: number } | null {
  const at = token.indexOf('@');
  if (at < 0) return { body: token, span: 1 };
  const suffix = token.slice(at + 1);
  if (!/^[1-9][0-9]*$/.test(suffix)) return null;
  return { body: token.slice(0, at), span: Number(suffix) };
}

/** Parse one step token. Empty `midis` = rest; null = beyond the subset. */
function parseStep(token: string): StepToken | null {
  const split = splitSpan(token);
  if (!split) return null;
  const { body, span } = split;

  if (body === '~') return { midis: [], span };

  if (body.startsWith('[')) {
    if (!body.endsWith(']')) return null;
    const inner = body.slice(1, -1);
    if (inner.includes('[')) return null; // no nesting
    const midis: number[] = [];
    for (const part of inner.split(',')) {
      // Spaces inside a branch (polyrhythm / sub-sequence) fail the note regex.
      const midi = tokenToMidi(part.trim());
      if (midi === null) return null;
      midis.push(midi);
    }
    if (midis.length === 0) return null;
    return { midis, span };
  }

  const midi = tokenToMidi(body);
  if (midi === null) return null;
  return { midis: [midi], span };
}

/** Parse one voice (mini string) into notes. null = beyond the subset. */
function parseLine(mini: string): PianoRoll | null {
  const tokens = tokenize(mini);
  if (!tokens || tokens.length === 0) return null;
  const notes: RollNote[] = [];
  let cursor = 0;
  for (const token of tokens) {
    const step = parseStep(token);
    if (step === null) return null;
    for (const midi of step.midis) notes.push({ midi, step: cursor, span: step.span });
    cursor += step.span;
  }
  return { notes, stepCount: cursor };
}

// ─── Clip content (code → model) ─────────────────────────────────────────────

/**
 * Derive the roll from a clip's stack arguments. Every argument must be a
 * `note("...")` within the subset — optionally chained (`.sound("piano")`…),
 * the chain being identical on every voice — all with the same step count.
 */
export function deriveRoll(api: PanelCodeApi, code: string, name: string): PianoRoll | null {
  const args = api.callArgs(code, name);
  if (!args || args.length === 0) return null;

  const voices: PianoRoll[] = [];
  let chain: string | null = null;
  for (const arg of args) {
    if (arg.isIdentifier) return null; // group of named clips — not note content
    // The whole argument must parse as a call rooted at `note` — this rejects
    // e.g. `note("c3") + x`, which splitChain alone would let through.
    const q = api.readExpr(arg.source);
    if (!q || !q.isCall() || q.callee() !== 'note') return null;
    const split = splitChain(arg.source);
    if (split === null) return null;
    if (chain === null) chain = split.chain;
    else if (chain !== split.chain) return null; // per-voice chains — complex
    const mini = miniOf(api, split.base, 'note');
    if (mini === null) return null;
    const voice = parseLine(mini);
    if (voice === null) return null;
    voices.push(voice);
  }

  const stepCount = voices[0].stepCount;
  if (voices.some((v) => v.stepCount !== stepCount)) return null;

  return {
    notes: voices.flatMap((v) => v.notes),
    stepCount,
    chain: chain ?? '',
    cycles: readCycles(api, code, name),
  };
}

/** The clips the piano roll can list: session-convention `const … = stack(…)`. */
export function deriveClips(api: PanelCodeApi, code: string, defs: Decl[]): RollClip[] {
  return defs
    .filter((d) => d.declKind === 'const' && d.initKind === 'pattern' && d.callee === 'stack')
    .map((d) => ({ name: d.name, roll: deriveRoll(api, code, d.name) }));
}

// ─── Serialization (model → code) ────────────────────────────────────────────

/** Notes sharing (step, span) fold back into one chord token. */
interface ChordGroup {
  step: number;
  span: number;
  midis: number[];
}

/** Group the notes into chords, sorted by (step, midi). */
function groupChords(notes: RollNote[]): ChordGroup[] {
  const sorted = [...notes].sort((a, b) => a.step - b.step || a.midi - b.midi);
  const groups: ChordGroup[] = [];
  const byKey = new Map<string, ChordGroup>();
  for (const note of sorted) {
    const key = `${note.step}@${note.span}`;
    let group = byKey.get(key);
    if (!group) {
      group = { step: note.step, span: note.span, midis: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.midis.push(note.midi);
  }
  return groups;
}

/** Greedy voice allocation: each chord goes to the first voice whose last
 *  chord ends at or before its start; otherwise a new voice opens. */
function allocateVoices(groups: ChordGroup[]): ChordGroup[][] {
  const voices: { end: number; groups: ChordGroup[] }[] = [];
  for (const group of groups) {
    const voice = voices.find((v) => v.end <= group.step);
    if (voice) {
      voice.groups.push(group);
      voice.end = group.step + group.span;
    } else {
      voices.push({ end: group.step + group.span, groups: [group] });
    }
  }
  return voices.map((v) => v.groups);
}

/** Mini string of one voice — gaps filled with one `~` per step. */
function voiceMini(groups: ChordGroup[], stepCount: number): string {
  const tokens: string[] = [];
  let cursor = 0;
  for (const group of groups) {
    for (; cursor < group.step; cursor++) tokens.push('~');
    const body =
      group.midis.length === 1
        ? noteToken(group.midis[0])
        : `[${group.midis.map(noteToken).join(',')}]`;
    tokens.push(group.span === 1 ? body : `${body}@${group.span}`);
    cursor = group.step + group.span;
  }
  for (; cursor < stepCount; cursor++) tokens.push('~');
  return tokens.join(' ');
}

/** The stack arguments for the roll — one `note("...")` per allocated voice,
 *  each carrying the shared chain back verbatim. */
export function serializeRoll(roll: PianoRoll): string {
  const chain = roll.chain ?? '';
  const voices = allocateVoices(groupChords(roll.notes));
  if (voices.length === 0) {
    return `note("${new Array(roll.stepCount).fill('~').join(' ')}")${chain}`;
  }
  return voices
    .map((voice) => `note("${voiceMini(voice, roll.stepCount)}")${chain}`)
    .join(', ');
}

/** Splice the new content over the clip's stack arguments (chain preserved). */
export function writeRoll(
  api: PanelCodeApi,
  code: string,
  name: string,
  roll: PianoRoll,
): string {
  const args = api.callArgs(code, name);
  if (!args || args.length === 0) return code;
  return api.spliceSpan(code, args[0].start, args[args.length - 1].end, serializeRoll(roll));
}

// ─── Mutations (pure, roll → roll) ───────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** True when a note of the same pitch intersects [step, step + span). */
function collides(
  notes: RollNote[],
  midi: number,
  step: number,
  span: number,
  skipIndex = -1,
): boolean {
  return notes.some(
    (n, i) =>
      i !== skipIndex && n.midi === midi && n.step < step + span && step < n.step + n.span,
  );
}

/** Add a note (pitch clamped to the display range, span clamped to the
 *  cycle — same policy as moveNote). Same-pitch overlaps are rejected and
 *  return the roll unchanged. */
export function addNote(roll: PianoRoll, midi: number, step: number, span: number): PianoRoll {
  if (step < 0 || step >= roll.stepCount) return roll;
  const m = clamp(midi, MIDI_MIN, MIDI_MAX);
  const s = clamp(span, 1, roll.stepCount - step);
  if (collides(roll.notes, m, step, s)) return roll;
  return { ...roll, notes: [...roll.notes, { midi: m, step, span: s }] };
}

export function removeNote(roll: PianoRoll, index: number): PianoRoll {
  return { ...roll, notes: roll.notes.filter((_, i) => i !== index) };
}

/** Move a note (pitch + start), clamped to the grid; same-pitch overlaps are
 *  rejected and return the roll unchanged. */
export function moveNote(roll: PianoRoll, index: number, midi: number, step: number): PianoRoll {
  const note = roll.notes[index];
  if (!note) return roll;
  const m = clamp(midi, MIDI_MIN, MIDI_MAX);
  const s = clamp(step, 0, roll.stepCount - note.span);
  if (collides(roll.notes, m, s, note.span, index)) return roll;
  const notes = roll.notes.map((n, i) => (i === index ? { ...n, midi: m, step: s } : n));
  return { ...roll, notes };
}

/** Resize a note's span: ≥ 1, clamped to the end of the cycle AND to the next
 *  same-pitch note — the no-overlap invariant of add/move holds here too. */
export function resizeNote(roll: PianoRoll, index: number, span: number): PianoRoll {
  const note = roll.notes[index];
  if (!note) return roll;
  let max = roll.stepCount - note.step;
  for (let i = 0; i < roll.notes.length; i++) {
    const n = roll.notes[i];
    if (i === index || n.midi !== note.midi || n.step <= note.step) continue;
    max = Math.min(max, n.step - note.step);
  }
  const s = clamp(span, 1, Math.max(1, max));
  const notes = roll.notes.map((n, i) => (i === index ? { ...n, span: s } : n));
  return { ...roll, notes };
}

/** Crop to `stepCount`: notes starting beyond drop out, spans truncate. */
export function setStepCount(roll: PianoRoll, stepCount: number): PianoRoll {
  const notes = roll.notes
    .filter((n) => n.step < stepCount)
    .map((n) => (n.step + n.span > stepCount ? { ...n, span: stepCount - n.step } : n));
  return { ...roll, notes, stepCount };
}
