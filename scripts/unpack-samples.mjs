// Restore an optional sample folder from an archive made by `samples:pack`.
//
// Usage:
//   node scripts/unpack-samples.mjs [archive]
//   npm run samples:unpack         # samples-vcsl.tgz → public/samples/VCSL
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const archiveAbs = resolve(process.argv[2] ?? 'samples-vcsl.tgz');
const samplesAbs = resolve('public/samples');

if (!existsSync(archiveAbs)) {
  console.error(`Archive not found: ${archiveAbs}`);
  console.error('Create it with `npm run samples:pack`, or drop the downloaded archive here first.');
  process.exit(1);
}

mkdirSync(samplesAbs, { recursive: true });

// GNU tar reads `C:` as a remote host, so pass forward-slashed paths relative to
// cwd (no drive letter) — accepted by both GNU tar and Windows bsdtar.
const toTar = (abs) => (relative(cwd, abs) || '.').replaceAll('\\', '/');
const res = spawnSync('tar', ['-xzf', toTar(archiveAbs), '-C', toTar(samplesAbs)], {
  stdio: 'inherit',
  cwd,
});
if (res.error || res.status !== 0) {
  console.error('tar failed (is `tar` available on your PATH?)', res.error ?? '');
  process.exit(res.status ?? 1);
}
console.log(`✔ unpacked ${archiveAbs} → public/samples/`);
