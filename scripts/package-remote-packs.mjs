// Packages the "tier 2" (heavy, remote-installable) sample packs out of
// public/samples/ into standalone zips under release-packs/ (gitignored).
//
// These zips are meant to be uploaded manually by the maintainer as GitHub
// release assets on https://github.com/IGSparkew/dual-samples — this script
// never touches that repo, it only produces the local artifacts + the
// packs-manifest.json entries (sha256/sizeBytes) to paste into
// public/samples/packs-manifest.json.
//
// Usage:
//   node scripts/package-remote-packs.mjs
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
// archiver@8 is native ESM with no default export — `ZipArchive` is the
// pre-configured (format: 'zip') subclass of its `Archiver` core.
import { ZipArchive } from 'archiver';

const SAMPLES_DIR = resolve('public/samples');
const OUT_DIR = resolve('release-packs');
const VERSION = 'v1';
const RELEASE_BASE_URL = 'https://github.com/IGSparkew/dual-samples/releases/download/v1';

mkdirSync(OUT_DIR, { recursive: true });

// Same recursive leaf-string flatten as scripts/vendor-samples.mjs (skip `_base`).
function collectPaths(node, acc = []) {
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

const VCSL_FAMILIES = [
  { id: 'vcsl-aerophones', folder: 'Aerophones' },
  { id: 'vcsl-idiophones', folder: 'Idiophones' },
  { id: 'vcsl-chordophones', folder: 'Chordophones' },
  { id: 'vcsl-membranophones', folder: 'Membranophones' },
  { id: 'vcsl-electrophones', folder: 'Electrophones' },
];

/** Streams `jsonEntries` (in-memory strings) and `fileEntries` (on-disk files)
 *  into a single zip at `zipPath`. Missing source files are skipped with a
 *  warning (mirrors vendor-samples.mjs's own "missing" behavior) rather than
 *  failing the whole pack. */
function writeZip(zipPath, { jsonEntries, fileEntries }) {
  return new Promise((resolvePromise, reject) => {
    const output = createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on('close', () => resolvePromise());
    archive.on('warning', (err) => console.warn(`  ⚠ ${err.message}`));
    archive.on('error', reject);
    output.on('error', reject);

    archive.pipe(output);

    for (const { name, content } of jsonEntries) {
      archive.append(content, { name });
    }

    let missing = 0;
    for (const { source, name } of fileEntries) {
      if (!existsSync(source)) {
        missing++;
        continue;
      }
      archive.file(source, { name });
    }
    if (missing > 0) {
      console.warn(`  ⚠ ${missing} referenced file(s) missing on disk, skipped`);
    }

    archive.finalize();
  });
}

function sha256(filePath) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolvePromise(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function finalizeEntry(zipName) {
  const zipPath = join(OUT_DIR, zipName);
  const sizeBytes = statSync(zipPath).size;
  const hash = await sha256(zipPath);
  return { sizeBytes, sha256: hash, url: `${RELEASE_BASE_URL}/${zipName}` };
}

async function packVcslFamily({ id, folder }) {
  const zipName = `${id}-${VERSION}.zip`;
  const zipPath = join(OUT_DIR, zipName);
  console.log(`\n📦 ${id} (VCSL/${folder})`);

  const fullMap = JSON.parse(readFileSync(join(SAMPLES_DIR, 'vcsl.json'), 'utf8'));
  const subset = {};
  const relsSet = new Set();

  for (const [key, value] of Object.entries(fullMap)) {
    if (key === '_base') continue;
    const rels = collectPaths(value, []);
    const decoded = rels.map((r) => decodeURIComponent(r));
    const families = new Set(decoded.map((r) => r.split('/')[0]));
    // Keep only keys whose files ALL live under this family's folder — drops
    // the rare key referencing a different (or missing) top-level folder
    // instead of silently duplicating it across two family packs.
    if (families.size !== 1 || !families.has(folder)) continue;
    subset[key] = value;
    rels.forEach((r) => relsSet.add(r));
  }

  const fileEntries = [...relsSet].map((rel) => {
    const decoded = decodeURIComponent(rel);
    return { source: join(SAMPLES_DIR, 'VCSL', decoded), name: `VCSL/${decoded}` };
  });

  await writeZip(zipPath, {
    jsonEntries: [{ name: 'vcsl.json', content: JSON.stringify(subset, null, 2) }],
    fileEntries,
  });

  console.log(`  ✔ ${Object.keys(subset).length} keys, ${fileEntries.length} files`);

  const { sizeBytes, sha256: hash, url } = await finalizeEntry(zipName);
  return {
    id,
    version: VERSION,
    url,
    sha256: hash,
    sizeBytes,
    map: 'vcsl.json',
    // NOT `VCSL/${folder}/` — vcsl.json's own paths already start with the
    // family folder (e.g. "Aerophones/…"), so a family-scoped base would
    // double it up against the zip's actual VCSL/<folder>/… layout.
    base: 'VCSL/',
  };
}

async function packTidalDrumMachines() {
  const id = 'tidal-drum-machines';
  const zipName = `${id}-${VERSION}.zip`;
  const zipPath = join(OUT_DIR, zipName);
  console.log(`\n📦 ${id}`);

  const mapFiles = ['tidal-drum-machines.json', 'EmuSP12.json'];
  const relsSet = new Set();
  const jsonEntries = mapFiles.map((mapFile) => {
    const raw = readFileSync(join(SAMPLES_DIR, mapFile), 'utf8');
    const map = JSON.parse(raw);
    collectPaths(map, []).forEach((r) => relsSet.add(r));
    return { name: mapFile, content: raw };
  });

  const fileEntries = [...relsSet].map((rel) => {
    const decoded = decodeURIComponent(rel);
    return {
      source: join(SAMPLES_DIR, 'tidal-drum-machines', 'machines', decoded),
      name: `machines/${decoded}`,
    };
  });

  await writeZip(zipPath, { jsonEntries, fileEntries });
  console.log(`  ✔ ${mapFiles.length} maps, ${fileEntries.length} files`);

  const { sizeBytes, sha256: hash, url } = await finalizeEntry(zipName);
  return {
    id,
    version: VERSION,
    url,
    sha256: hash,
    sizeBytes,
    maps: mapFiles,
    base: 'machines/',
  };
}

async function main() {
  const entries = [];
  for (const family of VCSL_FAMILIES) {
    entries.push(await packVcslFamily(family));
  }
  entries.push(await packTidalDrumMachines());

  console.log('\n=== packs-manifest.json entries (real sha256/sizeBytes) ===\n');
  for (const entry of entries) {
    console.log(JSON.stringify(entry, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
