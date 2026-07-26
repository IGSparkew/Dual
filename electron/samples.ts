import fs from 'node:fs/promises';
import path from 'node:path';
import { getUserDataRoot } from './paths';

// Mirrors UserSampleImport in src/core/types/desktop.ts — duplicated locally
// (same precedent as ProjectFile in ipc.ts and PackState in packs.ts) since
// electron/*.ts isn't part of the tsconfig project that resolves the @core alias.
export interface UserSampleImport {
  /** Pack name, already prefixed and slugified by the renderer (`user_kick`). */
  name: string;
  /** Audio files to write, `relPath` relative to the pack folder. */
  files: { relPath: string; bytes: ArrayBuffer }[];
  /** The dough-format map, serialized. Written as `<name>.json`. */
  mapJson: string;
}

/**
 * User imports live in userdata/samples/ alongside the tier-2 packs installed
 * by packs.ts. The `user_` prefix is what keeps the two apart: a pack id from
 * packs-manifest.json (vcsl-*, tidal-drum-machines) can never start with it,
 * so a folder bearing the prefix is always an import and vice versa. It is
 * also the marker the sound map carries, so provenance needs no side registry.
 */
export const USER_PACK_PREFIX = 'user_';

function samplesRoot(): string {
  return path.join(getUserDataRoot(), 'samples');
}

/** Rejects anything that could escape the pack folder or collide with a pack id. */
function assertSafeName(name: string): void {
  if (!/^user_[a-z0-9_]+$/.test(name)) {
    throw new Error(`Invalid user sample pack name: ${name}`);
  }
}

/** Same guard for the file names inside the pack — no nesting, no traversal. */
function assertSafeRelPath(relPath: string): void {
  if (relPath !== path.basename(relPath) || relPath.startsWith('.')) {
    throw new Error(`Invalid sample file path: ${relPath}`);
  }
}

/**
 * Writes an import to userdata/samples/<name>/: every audio file plus the
 * `<name>.json` map whose relative paths resolve against that same folder
 * (the shape SampleLoaderImpl.registerUserPack registers).
 *
 * Re-importing the same name overwrites the folder's contents rather than
 * merging, so a corrected import fully replaces the previous one.
 */
export async function importUserSamples(request: UserSampleImport): Promise<void> {
  assertSafeName(request.name);
  request.files.forEach((file) => assertSafeRelPath(file.relPath));

  const dir = path.join(samplesRoot(), request.name);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });

  await Promise.all(
    request.files.map((file) =>
      fs.writeFile(path.join(dir, file.relPath), Buffer.from(file.bytes)),
    ),
  );
  await fs.writeFile(path.join(dir, `${request.name}.json`), request.mapJson, 'utf-8');
}

/**
 * Names of the imported packs on disk: every `user_`-prefixed folder under
 * userdata/samples/ that actually carries its map. Called at boot to
 * re-register imports. Missing samples dir (fresh profile) yields [].
 */
export async function listUserPacks(): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(samplesRoot(), { withFileTypes: true });
  } catch {
    return [];
  }

  const candidates = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(USER_PACK_PREFIX))
    .map((entry) => entry.name);

  const present = await Promise.all(
    candidates.map(async (name) => {
      try {
        await fs.access(path.join(samplesRoot(), name, `${name}.json`));
        return name;
      } catch {
        return null; // folder without its map — half-written import, skip it
      }
    }),
  );
  return present.filter((name): name is string => name !== null).sort();
}

/** Removes an imported pack's folder. Unknown names resolve silently. */
export async function deleteUserPack(name: string): Promise<void> {
  assertSafeName(name);
  await fs.rm(path.join(samplesRoot(), name), { recursive: true, force: true });
}
