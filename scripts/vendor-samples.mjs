// Vendor the dough-samples packs into public/samples/ for fully offline playback.
//
// Usage:
//   git clone --recurse-submodules https://github.com/felixroos/dough-samples.git
//   node scripts/vendor-samples.mjs <path-to-dough-samples-clone>
//
// For each pack it strips `_base` from the .json (otherwise strudel would refetch
// from github despite the local files) and copies ONLY the files actually
// referenced by the map (except `piano`, a curated folder copied whole).
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const clone = resolve(process.argv[2] ?? '');
if (!clone || !existsSync(clone)) {
  console.error('Provide the path to a dough-samples clone (with --recurse-submodules).');
  process.exit(1);
}

const OUT = resolve('public/samples');
mkdirSync(OUT, { recursive: true });

// json (at clone root)  →  source folder its relative paths resolve against
const PACKS = [
  { json: 'Dirt-Samples.json', src: 'Dirt-Samples', copyWhole: false },
  { json: 'piano.json', src: 'piano', copyWhole: true },
  { json: 'vcsl.json', src: 'VCSL', copyWhole: false },
  { json: 'tidal-drum-machines.json', src: 'tidal-drum-machines/machines', copyWhole: false },
  { json: 'EmuSP12.json', src: 'tidal-drum-machines/machines', copyWhole: false },
  { json: 'mridangam.json', src: 'mrid', copyWhole: false },
];

// Flatten every leaf string in a strudel.json (skip the _base key).
function collectPaths(node, acc) {
  if (typeof node === 'string') {
    acc.push(node);
    return acc;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => collectPaths(n, acc));
    return acc;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === '_base') continue;
      collectPaths(v, acc);
    }
  }
  return acc;
}

for (const { json, src, copyWhole } of PACKS) {
  const map = JSON.parse(readFileSync(join(clone, json), 'utf8'));

  // Drop `_base` so samples(map, base) always uses our LOCAL base — no github fallback.
  delete map._base;
  writeFileSync(join(OUT, json), JSON.stringify(map, null, 2));

  const srcDir = join(clone, src);
  const destDir = join(OUT, src);

  if (copyWhole) {
    cpSync(srcDir, destDir, { recursive: true });
    console.log(`✔ ${json} + whole ${src}/`);
    continue;
  }

  const rels = [...new Set(collectPaths(map, []))];
  let copied = 0;
  for (const rel of rels) {
    // strudel.json stores URL-encoded paths (%20 space, %23 #, %2C ,…) because
    // they are fetched as URLs. On disk the files have the decoded names, and a
    // static server decodes the request back to them — so resolve & copy decoded.
    const decoded = decodeURIComponent(rel);
    const from = join(srcDir, decoded);
    const to = join(destDir, decoded);
    if (!existsSync(from)) {
      console.warn(`  ⚠ missing: ${src}/${decoded}`);
      continue;
    }
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
    copied++;
  }
  console.log(`✔ ${json} + ${copied}/${rels.length} files from ${src}/`);
}
