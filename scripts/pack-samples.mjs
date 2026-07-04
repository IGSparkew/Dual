// Pack a sample folder (default: VCSL) into a gzipped tar for transport / backup
// between machines. The .tgz itself is gitignored (`/samples-*.tgz`).
//
// Usage:
//   node scripts/pack-samples.mjs [folder] [outFile]
//   npm run samples:pack            # → samples-vcsl.tgz from public/samples/VCSL
import { existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const folder = process.argv[2] ?? 'VCSL';
const outArg = process.argv[3] ?? `samples-${folder.toLowerCase()}.tgz`;
const cwd = process.cwd();
const samplesAbs = resolve('public/samples');
const targetAbs = join(samplesAbs, folder);

if (!existsSync(targetAbs)) {
  console.error(`Folder not found: public/samples/${folder} (run \`npm run vendor:samples\` first).`);
  process.exit(1);
}

// `tar` ships with Windows 10+/macOS/Linux and handles multi-GB archives. But
// GNU tar reads `C:` as a remote host, so pass forward-slashed paths relative to
// cwd (no drive letter) — accepted by both GNU tar and Windows bsdtar.
const toTar = (abs) => (relative(cwd, abs) || '.').replaceAll('\\', '/');
const out = toTar(resolve(outArg));
const samples = toTar(samplesAbs);

// -C keeps archive paths relative to public/samples so unpack restores exactly
// public/samples/<folder>/.
const res = spawnSync('tar', ['-czf', out, '-C', samples, folder], { stdio: 'inherit', cwd });
if (res.error || res.status !== 0) {
  console.error('tar failed (is `tar` available on your PATH?)', res.error ?? '');
  process.exit(res.status ?? 1);
}
console.log(`✔ packed public/samples/${folder} → ${out}`);
