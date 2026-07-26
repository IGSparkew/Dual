/**
 * Tests for `electron/samples.ts` — the disk half of the browser's user sample
 * import (the renderer half is `modules/browser/browser.ts`, tested there).
 *
 * Same approach as `packs.test.ts`/`appState.test.ts`: a real temp dir with
 * only `./paths` mocked to point at it, so every fs call is genuine. What
 * matters here is what actually lands on disk, plus the two guards that keep an
 * import inside its own folder — the file names come from a drop, so they are
 * untrusted input.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let userDir: string;

vi.mock('../../electron/paths', () => ({
  getUserDataRoot: () => userDir,
}));

import { deleteUserPack, importUserSamples, listUserPacks } from '../../electron/samples';

function bytes(content: string): ArrayBuffer {
  const buffer = Buffer.from(content);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function samplesDir(): string {
  return path.join(userDir, 'samples');
}

beforeEach(() => {
  userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dual-samples-'));
  fs.mkdirSync(samplesDir(), { recursive: true });
});

afterEach(() => {
  fs.rmSync(userDir, { recursive: true, force: true });
});

describe('importUserSamples', () => {
  it('writes the audio files and the map into userdata/samples/<name>/', async () => {
    await importUserSamples({
      name: 'user_kit',
      files: [
        { relPath: 'bd.wav', bytes: bytes('BD') },
        { relPath: 'sd.wav', bytes: bytes('SD') },
      ],
      mapJson: '{"user_kit_bd":["bd.wav"]}',
    });

    const dir = path.join(samplesDir(), 'user_kit');
    expect(fs.readFileSync(path.join(dir, 'bd.wav'), 'utf-8')).toBe('BD');
    expect(fs.readFileSync(path.join(dir, 'sd.wav'), 'utf-8')).toBe('SD');
    // The map is named after the pack — that is what registerUserPack fetches.
    expect(fs.readFileSync(path.join(dir, 'user_kit.json'), 'utf-8')).toBe(
      '{"user_kit_bd":["bd.wav"]}',
    );
  });

  it('replaces a re-imported pack rather than merging into it', async () => {
    await importUserSamples({
      name: 'user_kit',
      files: [{ relPath: 'old.wav', bytes: bytes('OLD') }],
      mapJson: '{}',
    });
    await importUserSamples({
      name: 'user_kit',
      files: [{ relPath: 'new.wav', bytes: bytes('NEW') }],
      mapJson: '{}',
    });

    const dir = path.join(samplesDir(), 'user_kit');
    expect(fs.readdirSync(dir).sort()).toEqual(['new.wav', 'user_kit.json']);
  });

  it('rejects a name without the user_ prefix — it could shadow a tier-2 pack', async () => {
    await expect(
      importUserSamples({ name: 'vcsl-aerophones', files: [], mapJson: '{}' }),
    ).rejects.toThrow(/Invalid user sample pack name/);
    expect(fs.existsSync(path.join(samplesDir(), 'vcsl-aerophones'))).toBe(false);
  });

  it('rejects a name that would escape the samples folder', async () => {
    for (const name of ['user_../evil', 'user_a/b', '../user_evil', 'user_UPPER']) {
      await expect(importUserSamples({ name, files: [], mapJson: '{}' })).rejects.toThrow(
        /Invalid user sample pack name/,
      );
    }
  });

  it('rejects a file path that would escape the pack folder', async () => {
    for (const relPath of ['../evil.wav', 'sub/bd.wav', '.hidden.wav']) {
      await expect(
        importUserSamples({ name: 'user_kit', files: [{ relPath, bytes: bytes('X') }], mapJson: '{}' }),
      ).rejects.toThrow(/Invalid sample file path/);
    }
    expect(fs.existsSync(path.join(samplesDir(), 'evil.wav'))).toBe(false);
  });
});

describe('listUserPacks', () => {
  it('lists only user_ folders that carry their map, sorted', async () => {
    await importUserSamples({ name: 'user_kit', files: [], mapJson: '{}' });
    await importUserSamples({ name: 'user_epiano', files: [], mapJson: '{}' });
    // A tier-2 pack folder and a half-written import (no map) must be skipped.
    fs.mkdirSync(path.join(samplesDir(), 'tidal-drum-machines'), { recursive: true });
    fs.mkdirSync(path.join(samplesDir(), 'user_broken'), { recursive: true });

    expect(await listUserPacks()).toEqual(['user_epiano', 'user_kit']);
  });

  it('ignores a hand-placed map file at the samples root', async () => {
    // Those are registered by the other user-pack path — not imports.
    fs.writeFileSync(path.join(samplesDir(), 'user_loose.json'), '{}');
    expect(await listUserPacks()).toEqual([]);
  });

  it('returns [] on a fresh profile with no samples folder', async () => {
    fs.rmSync(samplesDir(), { recursive: true, force: true });
    expect(await listUserPacks()).toEqual([]);
  });
});

describe('deleteUserPack', () => {
  it('removes the pack folder and keeps the others', async () => {
    await importUserSamples({ name: 'user_kit', files: [], mapJson: '{}' });
    await importUserSamples({ name: 'user_epiano', files: [], mapJson: '{}' });

    await deleteUserPack('user_kit');
    expect(await listUserPacks()).toEqual(['user_epiano']);
  });

  it('resolves silently for an unknown pack', async () => {
    await expect(deleteUserPack('user_nope')).resolves.toBeUndefined();
  });

  it('refuses a traversal attempt', async () => {
    await expect(deleteUserPack('../samples')).rejects.toThrow(/Invalid user sample pack name/);
    expect(fs.existsSync(samplesDir())).toBe(true);
  });
});
