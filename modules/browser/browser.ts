/**
 * Browser — pure logic. No React, no IPC, no store access.
 *
 * Two halves, both testable in isolation:
 *  - READ: superdough's registered sounds → the tree the panel renders. The
 *    browser never lists the filesystem for display; what is playable is what
 *    is in the sound map, so the tree can't drift from what you hear.
 *  - IMPORT: dropped OS file names → { kind, name, map } for the main process
 *    to write. Bytes never come near this file, only names.
 *
 * The `user_` prefix is the ONLY marker of provenance — no side registry, no
 * metadata file. It also makes a user import structurally unable to collide
 * with a tier-2 pack id (vcsl-*, tidal-drum-machines) in userdata/samples/.
 */
import type { SoundInfo } from '@core/types/sound';
import { USER_SOUND_PREFIX } from '@core/types/sound';

// ─── Derived view (sound map → tree) ─────────────────────────────────────────

export type BrowserTab = 'samples' | 'userdata' | 'soundfonts';

export interface SoundEntry {
  /** Sound-map key — what goes in `s("…")` (`bd`, `user_mabank_bd`). */
  name: string;
  /** Label shown in the row: bank prefix and `user_` stripped. */
  displayName: string;
  origin: 'core' | 'user';
  kind: 'drum' | 'pitched';
  /** Files behind the name: list length, or note count when pitched. */
  variants: number;
}

export interface BankNode {
  /** Grouping prefix (`rolandtr909`, `user_mabank`), null for loose sounds. */
  bank: string | null;
  sounds: SoundEntry[];
}

/** Sounds sharing a `<prefix>_<instrument>` prefix are only grouped from this
 *  many members up. Below it the underscore is far more likely part of the
 *  name itself (an imported `my_kick`) than a bank convention. */
const MIN_BANK_MEMBERS = 2;

/** Prefixes hidden from labels: provenance/family markers, not part of a name. */
const LABEL_PREFIXES = [USER_SOUND_PREFIX, 'gm_'];

/** `rolandtr909_bd` → `rolandtr909`; null when the name carries no prefix. */
function bankPrefixOf(name: string): string | null {
  const cut = name.lastIndexOf('_');
  if (cut <= 0 || cut === name.length - 1) return null;
  // `user_kick` is a bare user sound, not bank `user` — the marker is not a
  // bank, and neither is the `gm_` family marker on a soundfont.
  const prefix = name.slice(0, cut);
  if (LABEL_PREFIXES.some((marker) => prefix === marker.replace(/_$/, ''))) return null;
  return prefix;
}

/** Which tab a sound belongs to — every sound lands in exactly one, and synths
 *  (superdough built-ins, no bank and nothing to browse) land in none. */
function tabOf(info: SoundInfo): BrowserTab | null {
  if (info.type === 'soundfont') return 'soundfonts';
  if (info.type !== 'sample') return null;
  return info.name.startsWith(USER_SOUND_PREFIX) ? 'userdata' : 'samples';
}

/**
 * Tree for one tab, filtered. `samples` holds what the core/tier-2 packs
 * registered, `userdata` the `user_`-prefixed imports, `soundfonts` the
 * General MIDI programs.
 *
 * Banks come first (alphabetically), loose sounds last under `bank: null`.
 * The filter matches the full map key, so typing `909` keeps the whole
 * `rolandtr909` group rather than emptying it.
 */
export function deriveTree(infos: SoundInfo[], tab: BrowserTab, filter = ''): BankNode[] {
  const needle = filter.trim().toLowerCase();
  // Count prefixes over the WHOLE tab, not the filtered subset: a search that
  // matches one member of a bank must still show it under its bank.
  const tabSounds = infos.filter((info) => tabOf(info) === tab);
  const wanted = tabSounds.filter(
    (info) => needle === '' || info.name.includes(needle),
  );
  const prefixCount = new Map<string, number>();
  for (const info of tabSounds) {
    const prefix = bankPrefixOf(info.name);
    if (prefix) prefixCount.set(prefix, (prefixCount.get(prefix) ?? 0) + 1);
  }

  const groups = new Map<string, SoundEntry[]>();
  const loose: SoundEntry[] = [];

  for (const info of wanted) {
    const prefix = bankPrefixOf(info.name);
    const grouped = prefix !== null && (prefixCount.get(prefix) ?? 0) >= MIN_BANK_MEMBERS;
    const entry: SoundEntry = {
      name: info.name,
      displayName: displayNameOf(info.name, grouped ? prefix : null),
      origin: info.name.startsWith(USER_SOUND_PREFIX) ? 'user' : 'core',
      kind: info.kind,
      variants: info.variants,
    };
    if (grouped) {
      const bucket = groups.get(prefix!) ?? [];
      bucket.push(entry);
      groups.set(prefix!, bucket);
    } else {
      loose.push(entry);
    }
  }

  const nodes: BankNode[] = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bank, sounds]) => ({ bank, sounds }));
  if (loose.length > 0) nodes.push({ bank: null, sounds: loose });
  return nodes;
}

/** Row label: drop the bank prefix, then the provenance/family marker. */
export function displayNameOf(name: string, bank: string | null): string {
  const withoutBank = bank && name.startsWith(`${bank}_`) ? name.slice(bank.length + 1) : name;
  return stripMarker(withoutBank);
}

/** Bank label: marker stripped, so an import or a GM family reads as itself. */
export function displayBank(bank: string): string {
  return stripMarker(bank);
}

function stripMarker(label: string): string {
  const marker = LABEL_PREFIXES.find((p) => label.startsWith(p) && label.length > p.length);
  return marker ? label.slice(marker.length) : label;
}

// ─── Import: detection ───────────────────────────────────────────────────────

export type ImportKind = 'single' | 'drum-bank' | 'pitched';

const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.flac', '.aiff', '.aif', '.ogg'];

export function isAudioFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * A dough-style note name at the START of a file name: `A0`, `Ds1` (dough
 * spells sharps `s`), `D#1`, `Eb1`, `C-1`. Trailing junk is tolerated and
 * dropped — `A0v8.mp3` is the note A0 (piano.json's own convention).
 */
const NOTE_NAME = /^([A-Ga-g](?:s|S|#|b|B)?-?\d+)/;

/** The note a file name denotes, or null when it isn't note-named. */
export function noteKeyOf(fileName: string): string | null {
  const match = NOTE_NAME.exec(baseName(fileName));
  return match ? match[1] : null;
}

/** `kick.wav` → `kick`; also strips any directory part of a dropped path. */
export function baseName(fileName: string): string {
  const flat = fileName.split(/[\\/]/).pop() ?? fileName;
  const dot = flat.lastIndexOf('.');
  return dot > 0 ? flat.slice(0, dot) : flat;
}

/**
 * Type of an import, from the audio file names alone:
 *  1. mostly note-named  → pitched instrument (a sampled instrument);
 *  2. several files      → drum bank;
 *  3. a single file      → lone sample.
 * The user can override the verdict in the confirm dialog.
 */
export function detectImportKind(fileNames: string[]): ImportKind {
  if (fileNames.length <= 1) return 'single';
  const notes = fileNames.filter((name) => noteKeyOf(name) !== null).length;
  if (notes * 2 > fileNames.length) return 'pitched';
  return 'drum-bank';
}

// ─── Import: naming ──────────────────────────────────────────────────────────

/** Lowercase, `[a-z0-9_]` only, no leading/trailing/doubled `_`. Empty input
 *  (or input with nothing keepable) yields `''` — the caller must reject it. */
export function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\.[^.]+$/, '') // drop a file extension if one was passed
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** The sound-map name of an imported pack — always `user_`-prefixed, and
 *  idempotent so a slug the user typed with the prefix isn't doubled. */
export function userPackName(slug: string): string {
  return slug.startsWith(USER_SOUND_PREFIX) ? slug : `${USER_SOUND_PREFIX}${slug}`;
}

// ─── Import: dough map generation ────────────────────────────────────────────

/** A dough-format sample map: drum entries are file lists (played by index),
 *  pitched entries map a note name to one file. Paths stay relative to the
 *  map's own folder — `samples(map, base)` resolves them. */
export type SampleMap = Record<string, string[] | Record<string, string>>;

/** Instrument key of a drum-kit file: `bd.wav`, `bd2.wav`, `bd-3.wav` all fold
 *  into `bd`, so numbered takes become `s("bd:1")` variants of one row. A name
 *  made only of digits (`808.wav`) keeps its digits — stripping would empty it. */
export function instrumentKeyOf(fileName: string): string {
  const slug = slugify(baseName(fileName));
  const stripped = slug.replace(/[_-]?\d+$/, '');
  return stripped === '' ? slug : stripped;
}

/**
 * The `.json` written beside the files, in the same format as piano.json /
 * jazz-bank.json:
 *   single    → { user_kick: ["kick.wav"] }
 *   drum-bank → { user_kit_bd: ["bd.wav"], user_kit_sd: ["sd.wav"] }
 *   pitched   → { user_epiano: { "A0": "A0v8.wav", … } }
 *
 * `fileNames` must already be filtered to audio files. Drum entries keep every
 * take of an instrument (index variants); a pitched note keeps the FIRST file
 * that claims it — the map shape holds one file per note, so velocity layers
 * beyond the first are dropped rather than silently mis-registered.
 */
export function buildSampleMap(
  kind: ImportKind,
  packName: string,
  fileNames: string[],
): SampleMap {
  if (kind === 'single') {
    return { [packName]: fileNames.slice(0, 1) };
  }
  if (kind === 'pitched') {
    const notes: Record<string, string> = {};
    for (const file of fileNames) {
      const note = noteKeyOf(file) ?? baseName(file);
      if (!(note in notes)) notes[note] = flatName(file);
    }
    return { [packName]: notes };
  }
  const bank: Record<string, string[]> = {};
  for (const file of fileNames) {
    const key = `${packName}_${instrumentKeyOf(file)}`;
    (bank[key] ??= []).push(flatName(file));
  }
  return bank;
}

/** Files are written flat inside the pack folder, so the map references the
 *  bare file name even when the drop carried a directory path. */
export function flatName(fileName: string): string {
  return fileName.split(/[\\/]/).pop() ?? fileName;
}

// NOTE — the code a dropped sound produces is NOT here. A drop is applied by
// the module that RECEIVES it (the session owns the clip convention: gate/gain
// consts, `NAME_BANK`), so those writes live in session.ts. This module's
// contract with it is the drag payload alone (@core/types/sample-drag).
