/**
 * Tests for `electron/appState.ts` — `getLastProjectPath`/`setLastProjectPath`,
 * the tiny `app-state.json` sidecar backing the "reopen last project on boot"
 * flow (`ProjectManagerImpl.loadLastProjectOnBoot`).
 *
 * Approach: a REAL temp directory (`os.tmpdir()`), not a mocked `fs` — the
 * module is a thin, synchronous fs wrapper with no Electron/IPC surface of its
 * own, so exercising the real filesystem is both simpler and a more faithful
 * test than mocking `node:fs`. Only `./paths` (which pulls in the `electron`
 * app object, unavailable outside a running Electron process) is mocked, to
 * point `getUserDataRoot()` at the temp dir.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmpDir: string;

vi.mock('./paths', () => ({
  getUserDataRoot: () => tmpDir,
}));

describe('getLastProjectPath / setLastProjectPath', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dual-appstate-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when app-state.json does not exist yet (first boot)', async () => {
    const { getLastProjectPath } = await import('./appState');
    expect(getLastProjectPath()).toBeNull();
  });

  it('round-trips a path written by setLastProjectPath', async () => {
    const { getLastProjectPath, setLastProjectPath } = await import('./appState');
    setLastProjectPath('/portable/userdata/projects/song.strudel');
    expect(getLastProjectPath()).toBe('/portable/userdata/projects/song.strudel');
  });

  it('persists to app-state.json inside the userdata root as pretty JSON', async () => {
    const { setLastProjectPath } = await import('./appState');
    setLastProjectPath('/a/b.strudel');
    const file = path.join(tmpDir, 'app-state.json');
    expect(fs.existsSync(file)).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({ lastProjectPath: '/a/b.strudel' });
  });

  it('clears the path back to null (e.g. after the last project is deleted/missing)', async () => {
    const { getLastProjectPath, setLastProjectPath } = await import('./appState');
    setLastProjectPath('/a/b.strudel');
    setLastProjectPath(null);
    expect(getLastProjectPath()).toBeNull();
  });

  it('returns null (does not throw) when app-state.json contains invalid JSON', async () => {
    const { getLastProjectPath } = await import('./appState');
    fs.writeFileSync(path.join(tmpDir, 'app-state.json'), '{ not valid json', 'utf-8');
    expect(getLastProjectPath()).toBeNull();
  });

  it('returns null when the file is valid JSON but missing the lastProjectPath key', async () => {
    const { getLastProjectPath } = await import('./appState');
    fs.writeFileSync(path.join(tmpDir, 'app-state.json'), JSON.stringify({}), 'utf-8');
    expect(getLastProjectPath()).toBeNull();
  });
});
