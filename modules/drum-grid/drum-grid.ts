/**
 * Drum grid model — pure helpers over the CodeRegion façade.
 *
 * The grid edits the *content* of a named clip (the arguments of its root
 * `stack(...)` call), never the gate/gain chain or the rest of the document.
 * It understands a deliberate subset of mini-notation:
 *
 *   - plain sample steps (`bd`, `hh:2`) and rests (`~`)
 *   - `sample*n` repeats
 *   - one-level `[...]` groups: spaces = sub-hits (`[hh hh]`), top-level
 *     commas = parallel voices (`[bd, cp]`)
 *
 * Anything richer (nested groups, `<>`, euclid, numbers…) marks the clip as
 * *complex* and the grid steps back — same policy as the session grid with a
 * hand-written `$:` block.
 *
 * Two serializations of the same model:
 *   - merged: one `s("bd cp [hh hh] sd")` line folding every row
 *   - split:  `s("bd ~ ~ ~"), s("~ cp ~ ~"), …` — one line per row
 */
import type { PanelCodeApi } from '@layout/api/PanelApi';
import type { Decl } from '@core/interpreter/CodeRegion';

// ─── Model ───────────────────────────────────────────────────────────────────

export interface DrumRow {
  /** Sample name as written in the mini-notation (`bd`, `hh:2`). */
  sample: string;
  /** Hit count per step: 0 = rest, 1 = hit, n > 1 = n sub-hits (`[hh hh]`). */
  steps: number[];
}

export type GridForm = 'merged' | 'split';

export interface DrumGrid {
  rows: DrumRow[];
  stepCount: number;
  form: GridForm;
}

/** A clip as the drum grid sees it; `grid` is null when the content is beyond
 *  the grid's mini-notation subset (the panel shows it as non-editable). */
export interface GridClip {
  name: string;
  grid: DrumGrid | null;
  /** Literal value of `NAME_BANK` (drum machine bank); null when unmanaged. */
  bank: string | null;
}

export const MAX_SUB_HITS = 4;
export const STEP_CHOICES = [4, 8, 16, 32] as const;

/** Suggested drum sample names (dough-samples default map). Free text is
 *  accepted everywhere — this is only the datalist. */
export const DRUM_SAMPLES = [
  'bd', 'sd', 'hh', 'oh', 'cp', 'rim', 'cb', 'lt', 'mt', 'ht', 'cr', 'rd', 'sh', 'perc',
];

/** Drum machine banks bundled by the tidal-drum-machines pack (see
 *  SampleLoaderImpl). Mirrors the `<Machine>_<sample>` prefixes of the vendored
 *  tidal-drum-machines.json — applied to a clip via `.bank("...")`. */
export const DRUM_BANKS = [
  'AJKPercusyn', 'AkaiLinn', 'AkaiMPC60', 'AkaiXR10', 'AlesisHR16', 'AlesisSR16',
  'BossDR110', 'BossDR220', 'BossDR55', 'BossDR550', 'CasioRZ1', 'CasioSK1',
  'CasioVL1', 'DoepferMS404', 'EmuDrumulator', 'EmuModular', 'EmuSP12',
  'KorgDDM110', 'KorgKPR77', 'KorgKR55', 'KorgKRZ', 'KorgM1', 'KorgMinipops',
  'KorgPoly800', 'KorgT3', 'Linn9000', 'LinnDrum', 'LinnLM1', 'LinnLM2',
  'MFB512', 'MoogConcertMateMG1', 'MPC1000', 'OberheimDMX', 'RhodesPolaris',
  'RhythmAce', 'RolandCompurhythm1000', 'RolandCompurhythm78',
  'RolandCompurhythm8000', 'RolandD110', 'RolandD70', 'RolandDDR30',
  'RolandJD990', 'RolandMC202', 'RolandMC303', 'RolandMT32', 'RolandR8',
  'RolandS50', 'RolandSH09', 'RolandSystem100', 'RolandTR505', 'RolandTR606',
  'RolandTR626', 'RolandTR707', 'RolandTR727', 'RolandTR808', 'RolandTR909',
  'SakataDPM48', 'SequentialCircuitsDrumtracks', 'SequentialCircuitsTom',
  'SergeModular', 'SimmonsSDS400', 'SimmonsSDS5', 'SoundmastersR88',
  'UnivoxMicroRhythmer12', 'ViscoSpaceDrum', 'XdrumLM8953', 'YamahaRM50',
  'YamahaRX21', 'YamahaRX5', 'YamahaRY30', 'YamahaTG33',
];

// ─── Bank availability (sound map → choices) ─────────────────────────────────
// superdough lowercases every sound-map key on registration: the pack ships
// `RolandTR909_bd` but the store holds `rolandtr909_bd`. Playback lookup is
// case-insensitive, so `.bank(...)` keeps the display casing — but every
// availability check below compares in lowercase.

export interface BankInfo {
  /** Bank name as written in `.bank(...)` (DRUM_BANKS casing when known). */
  name: string;
  /** Grid instruments (row sample without `:n`) absent from this machine. */
  missing: string[];
}

/** `hh:2` → `hh`, lowercased — the instrument key of a row sample. */
function instrumentOf(sample: string): string {
  const colon = sample.indexOf(':');
  return (colon >= 0 ? sample.slice(0, colon) : sample).toLowerCase();
}

/** machine (lowercase) → its instruments, splitting each sound name on its
 *  LAST `_` (`rolandtr909_bd` → rolandtr909 / bd). Names without `_` are not
 *  machine sounds and are skipped. */
function machineKits(sounds: string[]): Map<string, Set<string>> {
  const kits = new Map<string, Set<string>>();
  for (const sound of sounds) {
    const name = sound.toLowerCase();
    const cut = name.lastIndexOf('_');
    if (cut <= 0 || cut === name.length - 1) continue;
    const machine = name.slice(0, cut);
    let kit = kits.get(machine);
    if (!kit) {
      kit = new Set();
      kits.set(machine, kit);
    }
    kit.add(name.slice(cut + 1));
  }
  return kits;
}

/**
 * The banks the toolbar offers: DRUM_BANKS (canonical casing for `.bank(...)`)
 * filtered to the machines actually registered, then the prefixes discovered
 * at runtime (user packs) appended alphabetically, displayed as-is
 * (lowercase). Each carries the grid instruments its kit does not cover —
 * partial kits are common (RolandSH09 only ships `bd`).
 *
 * Before any pack has registered (`sounds` empty) this degrades to the full
 * DRUM_BANKS list with empty `missing` — no false negatives while loading.
 */
export function deriveBankChoices(sounds: string[], grid: DrumGrid | null): BankInfo[] {
  if (sounds.length === 0) return DRUM_BANKS.map((name) => ({ name, missing: [] }));

  const kits = machineKits(sounds);
  const instruments = [...new Set((grid?.rows ?? []).map((row) => instrumentOf(row.sample)))];
  const toInfo = (name: string, kit: Set<string>): BankInfo => ({
    name,
    missing: instruments.filter((instr) => !kit.has(instr)),
  });

  const knownSet = new Set(DRUM_BANKS.map((bank) => bank.toLowerCase()));
  const known = DRUM_BANKS.filter((bank) => kits.has(bank.toLowerCase()));
  const discovered = [...kits.keys()].filter((machine) => !knownSet.has(machine)).sort();

  return [
    ...known.map((bank) => toInfo(bank, kits.get(bank.toLowerCase())!)),
    ...discovered.map((machine) => toInfo(machine, kits.get(machine)!)),
  ];
}

/**
 * Row samples of the grid that will not resolve at playback: with a bank the
 * lookup key is `${bank}_${instrument}`, without one the bare sound name
 * (`hh:2` → `hh`) — both compared in lowercase. Empty `sounds` (packs still
 * loading) yields an empty set — no false negatives.
 */
export function missingRowSamples(
  sounds: string[],
  grid: DrumGrid,
  bank: string | null,
): Set<string> {
  if (sounds.length === 0) return new Set();
  const have = new Set(sounds.map((sound) => sound.toLowerCase()));
  const missing = new Set<string>();
  for (const row of grid.rows) {
    const instr = instrumentOf(row.sample);
    const key = bank ? `${bank.toLowerCase()}_${instr}` : instr;
    if (!have.has(key)) missing.add(row.sample);
  }
  return missing;
}

// ─── Mini-notation subset (parse) ────────────────────────────────────────────

/** One hit within a step. */
interface Hit {
  sample: string;
  count: number;
}

const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*(?::\d+)?$/;

/** True when `name` is a valid mini-notation sample token (`bd`, `hh:2`,
 *  `bd_my`) — the gate for free-text row names (add / rename). */
export function isSampleName(name: string): boolean {
  return NAME_RE.test(name);
}

/** Split a mini string into top-level tokens (bracket groups stay intact). */
function tokenize(mini: string): string[] | null {
  const tokens: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of mini.trim()) {
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth < 0) return null;
    }
    if (/\s/.test(ch) && depth === 0) {
      if (current) tokens.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (depth !== 0) return null;
  if (current) tokens.push(current);
  return tokens;
}

/** Parse one step token into its hits. `[]` = rest; null = beyond the subset. */
function parseStep(token: string): Hit[] | null {
  if (token === '~' || token === '-') return [];

  if (token.startsWith('[')) {
    if (!token.endsWith(']')) return null;
    const inner = token.slice(1, -1);
    if (inner.includes('[')) return null; // one nesting level only
    const hits: Hit[] = [];
    for (const voice of inner.split(',')) {
      const parts = voice.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) return null;
      // Per-sample occurrence count within the voice. `[bd hh]` (mixed
      // sequence) round-trips as `[bd, hh]` (parallel) — accepted loss.
      const order: string[] = [];
      const counts = new Map<string, number>();
      for (const part of parts) {
        if (part === '~') continue;
        if (!NAME_RE.test(part)) return null;
        if (!counts.has(part)) order.push(part);
        counts.set(part, (counts.get(part) ?? 0) + 1);
      }
      for (const sample of order) hits.push({ sample, count: counts.get(sample)! });
    }
    return hits;
  }

  const star = token.match(/^([^*]+)\*(\d+)$/);
  if (star) {
    if (!NAME_RE.test(star[1])) return null;
    return [{ sample: star[1], count: Number(star[2]) }];
  }

  if (!NAME_RE.test(token)) return null;
  return [{ sample: token, count: 1 }];
}

/** Parse one mini string into per-step hits. null = beyond the subset. */
function parseLine(mini: string): Hit[][] | null {
  const tokens = tokenize(mini);
  if (!tokens || tokens.length === 0) return null;
  const steps: Hit[][] = [];
  for (const token of tokens) {
    const hits = parseStep(token);
    if (hits === null) return null;
    steps.push(hits);
  }
  return steps;
}

/** Fold one parsed line into rows (samples in order of first appearance). */
function lineToRows(steps: Hit[][]): DrumRow[] {
  const rows: DrumRow[] = [];
  const byName = new Map<string, DrumRow>();
  steps.forEach((hits, i) => {
    for (const hit of hits) {
      let row = byName.get(hit.sample);
      if (!row) {
        row = { sample: hit.sample, steps: new Array<number>(steps.length).fill(0) };
        byName.set(hit.sample, row);
        rows.push(row);
      }
      row.steps[i] += hit.count;
    }
  });
  return rows;
}

// ─── Clip content (code → model) ─────────────────────────────────────────────

/** True when `source` is a single bare call — no `.chain()` after the closing
 *  paren. Textual scan; balanced parens inside the mini string are fine. */
function isBareCall(source: string): boolean {
  const s = source.trim();
  const open = s.indexOf('(');
  if (open < 0) return false;
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0) return i === s.length - 1;
    }
  }
  return false;
}

/** The mini string of a bare `s("...")` expression, null for anything else. */
function miniOf(api: PanelCodeApi, source: string): string | null {
  if (!isBareCall(source)) return null;
  const q = api.readExpr(source);
  if (!q || !q.isCall() || q.callee() !== 's') return null;
  const args = q.args();
  if (args.length !== 1) return null;
  const literal = args[0].source.match(/^(['"`])([\s\S]*)\1$/);
  return literal ? literal[2] : null;
}

/**
 * Derive the grid from a clip's stack arguments. Every argument must be a bare
 * `s("...")` within the subset, all with the same step count (polyrhythm steps
 * back). More than one argument = the pattern is already split.
 */
export function deriveGrid(api: PanelCodeApi, code: string, name: string): DrumGrid | null {
  const args = api.callArgs(code, name);
  if (!args || args.length === 0) return null;

  const lines: Hit[][][] = [];
  for (const arg of args) {
    if (arg.isIdentifier) return null; // group of named clips — not a drum pattern
    const mini = miniOf(api, arg.source);
    if (mini === null) return null;
    const steps = parseLine(mini);
    if (steps === null) return null;
    lines.push(steps);
  }

  const stepCount = lines[0].length;
  if (lines.some((line) => line.length !== stepCount)) return null;

  return {
    rows: lines.flatMap(lineToRows),
    stepCount,
    form: args.length > 1 ? 'split' : 'merged',
  };
}

// ─── Bank (clip ↔ its config const) ──────────────────────────────────────────
// Same naming convention as the mixer's NAME_ON / NAME_GAIN consts.

export function bankName(clip: string): string {
  return `${clip.toUpperCase()}_BANK`;
}

/** Literal value of a clip's `NAME_BANK` const (null when absent). */
function readBank(byName: Map<string, Decl>, clip: string): string | null {
  const def = byName.get(bankName(clip));
  if (!def || def.initKind !== 'value') return null;
  const literal = def.source.trim().match(/^(['"`])([\s\S]*)\1$/);
  return literal ? literal[2] : null;
}

/**
 * Set a clip's drum machine bank. First touch provisions the machinery —
 * `.bank(NAME_BANK)` appended to the initializer, const inserted just above —
 * afterwards only the const value flips. An empty bank is a no-op in
 * superdough (no prefix), so "no bank" is `NAME_BANK = ""` once provisioned.
 */
export function setBank(api: PanelCodeApi, code: string, name: string, bank: string): string {
  const defs = api.list(code) ?? [];
  const bankC = bankName(name);
  if (defs.some((d) => d.name === bankC)) {
    return api.setInit(code, bankC, JSON.stringify(bank));
  }
  if (!bank) return code; // nothing to clear
  const def = defs.find((d) => d.name === name);
  if (!def) return code;
  const next = api.spliceSpan(code, def.initEnd, def.initEnd, `.bank(${bankC})`);
  const def2 = (api.list(next) ?? []).find((d) => d.name === name);
  if (!def2) return next;
  return api.spliceSpan(next, def2.start, def2.start, `const ${bankC} = ${JSON.stringify(bank)};\n`);
}

/** The clips the drum grid can list: session-convention `const … = stack(…)`. */
export function deriveClips(api: PanelCodeApi, code: string, defs: Decl[]): GridClip[] {
  const byName = new Map(defs.map((d) => [d.name, d]));
  return defs
    .filter((d) => d.declKind === 'const' && d.initKind === 'pattern' && d.callee === 'stack')
    .map((d) => ({
      name: d.name,
      grid: deriveGrid(api, code, d.name),
      bank: readBank(byName, d.name),
    }));
}

// ─── Serialization (model → code) ────────────────────────────────────────────

/** `hh` → `hh`, count 2 → `hh hh` (caller decides on brackets). */
function subHits(sample: string, count: number): string {
  return new Array<string>(count).fill(sample).join(' ');
}

/** Mini string of one row (split form). */
export function rowMini(row: DrumRow): string {
  return row.steps
    .map((count) => {
      if (count === 0) return '~';
      if (count === 1) return row.sample;
      return `[${subHits(row.sample, count)}]`;
    })
    .join(' ');
}

/** All rows folded into a single line (merged form). */
function mergedMini(grid: DrumGrid): string {
  const tokens: string[] = [];
  for (let i = 0; i < grid.stepCount; i++) {
    const voices = grid.rows
      .filter((row) => row.steps[i] > 0)
      .map((row) => subHits(row.sample, row.steps[i]));
    if (voices.length === 0) tokens.push('~');
    else if (voices.length === 1) {
      tokens.push(voices[0].includes(' ') ? `[${voices[0]}]` : voices[0]);
    } else {
      tokens.push(`[${voices.join(', ')}]`);
    }
  }
  return tokens.join(' ');
}

/** The stack arguments for the grid — `s("...")` or `s("..."), s("...")`. */
export function serializeGrid(grid: DrumGrid): string {
  if (grid.form === 'split' && grid.rows.length > 0) {
    return grid.rows.map((row) => `s("${rowMini(row)}")`).join(', ');
  }
  return `s("${mergedMini(grid)}")`;
}

/** Splice the new content over the clip's stack arguments (chain preserved). */
export function writeGrid(
  api: PanelCodeApi,
  code: string,
  name: string,
  grid: DrumGrid,
): string {
  const args = api.callArgs(code, name);
  if (!args || args.length === 0) return code;
  return api.spliceSpan(code, args[0].start, args[args.length - 1].end, serializeGrid(grid));
}

// ─── Mutations (pure, grid → grid) ───────────────────────────────────────────

function withRow(grid: DrumGrid, rowIndex: number, steps: number[]): DrumGrid {
  const rows = grid.rows.map((row, i) => (i === rowIndex ? { ...row, steps } : row));
  return { ...grid, rows };
}

/** Flip a step between rest and a single hit. */
export function toggleStep(grid: DrumGrid, rowIndex: number, step: number): DrumGrid {
  const row = grid.rows[rowIndex];
  if (!row) return grid;
  const steps = row.steps.slice();
  steps[step] = steps[step] === 0 ? 1 : 0;
  return withRow(grid, rowIndex, steps);
}

/** Cycle an active step's sub-hits 1 → 2 → … → MAX_SUB_HITS → 1. */
export function cycleSubHits(grid: DrumGrid, rowIndex: number, step: number): DrumGrid {
  const row = grid.rows[rowIndex];
  if (!row || row.steps[step] === 0) return grid;
  const steps = row.steps.slice();
  steps[step] = (steps[step] % MAX_SUB_HITS) + 1;
  return withRow(grid, rowIndex, steps);
}

export function addRow(grid: DrumGrid, sample: string): DrumGrid {
  const row: DrumRow = { sample, steps: new Array<number>(grid.stepCount).fill(0) };
  return { ...grid, rows: [...grid.rows, row] };
}

export function removeRow(grid: DrumGrid, rowIndex: number): DrumGrid {
  return { ...grid, rows: grid.rows.filter((_, i) => i !== rowIndex) };
}

/** Rename a row's sample (steps kept). Caller validates with `isSampleName`. */
export function renameRow(grid: DrumGrid, rowIndex: number, sample: string): DrumGrid {
  const rows = grid.rows.map((row, i) => (i === rowIndex ? { ...row, sample } : row));
  return { ...grid, rows };
}

/** Crop or right-pad every row to `stepCount` steps. */
export function setStepCount(grid: DrumGrid, stepCount: number): DrumGrid {
  const rows = grid.rows.map((row) => {
    const steps = row.steps.slice(0, stepCount);
    while (steps.length < stepCount) steps.push(0);
    return { ...row, steps };
  });
  return { ...grid, rows, stepCount };
}

export function setForm(grid: DrumGrid, form: GridForm): DrumGrid {
  return { ...grid, form };
}

/**
 * Stable sort of the rows by a remembered sample order — display concern.
 * Merged form derives row order from first appearance in the mini string, so
 * without this a row would jump around when its earliest hit moves. Samples
 * absent from `order` keep their derived order, after the known ones.
 */
export function orderRows(grid: DrumGrid, order: string[]): DrumGrid {
  if (order.length === 0) return grid;
  const rank = new Map(order.map((sample, i) => [sample, i]));
  const rows = grid.rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const ra = rank.get(a.row.sample) ?? order.length + a.i;
      const rb = rank.get(b.row.sample) ?? order.length + b.i;
      return ra - rb || a.i - b.i;
    })
    .map((entry) => entry.row);
  return { ...grid, rows };
}
