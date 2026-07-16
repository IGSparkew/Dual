/**
 * Tests for `scripts/package-remote-packs.mjs` — the maintainer-only,
 * one-off packaging script that produces the tier-2 sample pack zips
 * uploaded to GitHub Releases (see its own header comment).
 *
 * Why this stays a light smoke/static-consistency check rather than a full
 * unit test suite exercising `collectPaths`/`packVcslFamily`/
 * `packTidalDrumMachines`:
 *  - None of its functions are exported (single-file script, `main()` is
 *    invoked unconditionally at the bottom) — testing them directly would
 *    require either modifying the script (out of scope: it is application
 *    source, not a test file) or `eval`-ing fragile hand-extracted function
 *    bodies, which tests our copy of the logic, not the real one.
 *  - Actually importing/running the script executes `main()` for real: it
 *    reads `public/samples/vcsl.json` + the VCSL/tidal-drum-machines sample
 *    folders (multi-hundred-MB, not vendored in this checkout — see
 *    `local-samples.md`), shells out to `archiver`, and writes zips under
 *    `release-packs/`. That's exactly the "no full run in tests" case the
 *    task calls out; it has already been run manually once by the
 *    maintainer to produce the real `packs-manifest.json` (its sha256/
 *    sizeBytes values below are the real, verified output of that run).
 *
 * What IS covered here, cheaply and without executing the script:
 *  - `node --check` as a syntax smoke test (catches accidental syntax
 *    breakage without running `main()`).
 *  - Static-source consistency checks that the script's hardcoded VCSL
 *    family list and tidal-drum-machines map list match what actually
 *    shipped in `public/samples/packs-manifest.json` — regression coverage
 *    for "someone renames/reorders an id in one file but not the other"
 *    without needing to run the real packaging pipeline.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_PATH = path.resolve(__dirname, '../../scripts/package-remote-packs.mjs');
const MANIFEST_PATH = path.resolve(__dirname, '..', '..', 'public', 'samples', 'packs-manifest.json');

const scriptSource = fs.readFileSync(SCRIPT_PATH, 'utf-8');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) as {
  packs: Array<{
    id: string;
    map?: string;
    maps?: string[];
    base: string;
    sha256: string;
    sizeBytes: number;
  }>;
};

describe('scripts/package-remote-packs.mjs (smoke + static consistency)', () => {
  it('is syntactically valid ESM (node --check), without ever running main()', () => {
    // Throws (non-zero exit) on a syntax error; does not execute the module body.
    expect(() => execFileSync(process.execPath, ['--check', SCRIPT_PATH])).not.toThrow();
  });

  it('declares exactly the 5 VCSL family packs that packs-manifest.json ships', () => {
    const manifestVcslIds = manifest.packs
      .filter((p) => p.id.startsWith('vcsl-'))
      .map((p) => p.id)
      .sort();

    // VCSL_FAMILIES entries look like: { id: 'vcsl-aerophones', folder: 'Aerophones' },
    const familyMatches = [...scriptSource.matchAll(/id:\s*'([^']+)',\s*folder:\s*'([^']+)'/g)];
    const scriptVcslIds = familyMatches.map((m) => m[1]).sort();

    expect(scriptVcslIds).toEqual(manifestVcslIds);
    expect(scriptVcslIds).toHaveLength(5);
  });

  it('uses the shared VCSL/ base (not a per-family folder) for every VCSL pack', () => {
    // Regression guard: vcsl.json's own paths already start with the family
    // folder (e.g. "Aerophones/…"), so a family-scoped base like
    // "VCSL/Aerophones/" would double up the folder against the zip's actual
    // VCSL/<folder>/… layout and 404 every sound at runtime. base must stay
    // the shared 'VCSL/' root for all 5 families.
    for (const entry of manifest.packs.filter((p) => p.id.startsWith('vcsl-'))) {
      expect(entry.base).toBe('VCSL/');
    }
    expect(scriptSource).toMatch(/base:\s*'VCSL\/'/);
  });

  it('packages tidal-drum-machines from the same two map files listed in the manifest', () => {
    const tidalEntry = manifest.packs.find((p) => p.id === 'tidal-drum-machines');
    expect(tidalEntry).toBeDefined();
    expect(tidalEntry?.maps).toEqual(['tidal-drum-machines.json', 'EmuSP12.json']);
    expect(tidalEntry?.base).toBe('machines/');

    // packTidalDrumMachines() hardcodes: const mapFiles = ['tidal-drum-machines.json', 'EmuSP12.json'];
    expect(scriptSource).toMatch(
      /mapFiles\s*=\s*\[\s*'tidal-drum-machines\.json'\s*,\s*'EmuSP12\.json'\s*\]/,
    );
    // extractZip's shared base for both maps: `machines/${decoded}` / base: 'machines/'.
    expect(scriptSource).toMatch(/base:\s*'machines\/'/);
  });

  it('every manifest entry has a well-formed sha256 (64 lowercase hex chars) and a positive sizeBytes', () => {
    // Regression guard: catches a manifest hand-edited with a placeholder/
    // truncated hash instead of the real output of a `packVcslFamily`/
    // `packTidalDrumMachines` run (both use `sha256Hex` via node:crypto).
    for (const entry of manifest.packs) {
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.sizeBytes).toBeGreaterThan(0);
    }
  });
});
