// Vendor the @strudel/soundfonts General-MIDI fonts into public/samples/soundfonts/
// for fully offline `gm_*` playback (gm_piano, gm_synth_bass_1, …).
//
// Why: @strudel/soundfonts fetches each preset lazily from
//   https://felixroos.github.io/webaudiofontdata/sound/<name>.js
// at first play (fontloader.mjs → loadFont). That breaks the project's
// "0 network request at runtime" rule. This script downloads every ACTIVE
// font referenced by the package's gm.mjs so `setSoundfontUrl()` can point at
// the local folder instead (see SampleLoaderImpl / StrudelBridgeImpl).
//
// Source of truth: node_modules/@strudel/soundfonts/gm.mjs is a pure default
// export (an object mapping gm_ names → arrays of font file names). Commented-out
// variants use `//` and are therefore absent from the parsed object — importing
// it yields EXACTLY the fonts the runtime can select via `gm_foo:<n>`.
//
// Usage:
//   npm install            # ensure @strudel/soundfonts is present
//   npm run vendor:soundfonts
//
// Re-running is safe/resumable: already-downloaded files are skipped.
import { mkdirSync, existsSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

// Same base the package uses by default (fontloader.mjs `defaultSoundfontUrl`).
const BASE_URL = 'https://felixroos.github.io/webaudiofontdata/sound';
const OUT = resolve(ROOT, 'public/samples/soundfonts');
const CONCURRENCY = 12;
const RETRIES = 3;

const gmPath = resolve(ROOT, 'node_modules/@strudel/soundfonts/gm.mjs');
if (!existsSync(gmPath)) {
  console.error('Missing node_modules/@strudel/soundfonts/gm.mjs — run `npm install` first.');
  process.exit(1);
}

const gm = (await import(`file://${gmPath}`)).default;

// Flatten every referenced font name into a unique, sorted list. gm.mjs carries
// a few malformed entries (empty/typo names, e.g. `..._sf2_fible`) that 404
// upstream and would fail at runtime too — drop obviously-bad ones up front.
const VALID = /^[0-9A-Za-z_]+_sf2_file$/i;
const all = [...new Set(Object.values(gm).flat())];
const fonts = all.filter((n) => VALID.test(n)).sort();
const malformed = all.filter((n) => !VALID.test(n));
console.log(`Found ${Object.keys(gm).length} gm_ instruments, ${fonts.length} unique active fonts.`);
if (malformed.length) {
  console.warn(`  (skipping ${malformed.length} malformed gm.mjs entries: ${malformed.map((m) => JSON.stringify(m)).join(', ')})`);
}

mkdirSync(OUT, { recursive: true });

class HttpError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

async function fetchText(url) {
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) throw new HttpError(404); // permanent — don't retry
      if (!res.ok) throw new HttpError(res.status);
      return await res.text();
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) throw err;
      if (attempt === RETRIES) throw err;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

let done = 0;
let downloaded = 0;
let skipped = 0;
let missing = []; // 404 upstream — not vendorable, not a hard failure
let failed = []; // network/other errors — worth retrying

async function vendorOne(name) {
  const dest = join(OUT, `${name}.js`);
  if (existsSync(dest) && statSync(dest).size > 0) {
    skipped++;
  } else {
    try {
      const text = await fetchText(`${BASE_URL}/${name}.js`);
      // Sanity: the package expects `varName={...}` (loadFont splits on `={`).
      if (!text.includes('={')) throw new Error('unexpected format (no `={`)');
      writeFileSync(dest, text);
      downloaded++;
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) missing.push(name);
      else failed.push({ name, error: String(err.message ?? err) });
    }
  }
  done++;
  if (done % 25 === 0 || done === fonts.length) {
    process.stdout.write(`\r  ${done}/${fonts.length} (↓${downloaded} skip${skipped} miss${missing.length} fail${failed.length})   `);
  }
}

// Simple bounded-concurrency pool.
const queue = [...fonts];
async function worker() {
  while (queue.length) await vendorOne(queue.shift());
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
process.stdout.write('\n');

// Report total footprint on disk.
let bytes = 0;
for (const f of readdirSync(OUT)) {
  if (f.endsWith('.js')) bytes += statSync(join(OUT, f)).size;
}
console.log(`✔ soundfonts vendored → public/samples/soundfonts/`);
console.log(`  ${downloaded} downloaded, ${skipped} already present, ${missing.length} missing upstream (404), ${failed.length} failed`);
console.log(`  total on disk: ${(bytes / 1024 / 1024).toFixed(1)} MB`);

if (missing.length) {
  console.warn(`\nℹ ${missing.length} font(s) 404 upstream (broken refs in Strudel's gm.mjs — they`);
  console.warn(`  would fail at runtime on strudel.cc too, so not vendorable): ${missing.join(', ')}`);
}

if (failed.length) {
  console.error(`\n⚠ ${failed.length} font(s) failed on network/other errors — re-run to retry:`);
  for (const { name, error } of failed.slice(0, 20)) console.error(`  ${name}: ${error}`);
  process.exit(1);
}
