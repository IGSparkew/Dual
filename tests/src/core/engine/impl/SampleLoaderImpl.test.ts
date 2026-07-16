/**
 * Tests for `SampleLoaderImpl.loadInstalledPack` (public) which drives the
 * private `loadInstalledPacks`/`fetchPackManifest` helpers — the renderer-side
 * half of the "on-demand sample pack" flow (electron/packs.ts is the other
 * half, see electron/packs.test.ts).
 *
 * `superdough` is mocked (its top-level `soundMap` store is only touched by
 * getSoundNames/onSoundsChanged, unused here) and `@strudel/webaudio` is
 * mocked so `samples()` is a spy instead of a real registration call — same
 * precedent as AudioExporterImpl.test.ts for keeping real Strudel/superdough
 * code out of the unit under test.
 *
 * `window` does not exist in vitest's default `node` test environment (no
 * jsdom configured — see `vitest.config.ts` and the same gotcha documented in
 * `ProjectManagerImpl.test.ts`), so `vi.stubGlobal('window', ...)` provides
 * the minimal `dualDesktop` surface `SampleLoaderImpl` touches. `fetch` is
 * likewise stubbed per test to control the manifest response.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { samplesMock } = vi.hoisted(() => ({ samplesMock: vi.fn().mockResolvedValue(undefined) }));

vi.mock('superdough', () => ({
  soundMap: { get: () => ({}), listen: () => () => {}, setKey: () => {} },
}));

vi.mock('@strudel/webaudio', () => ({
  samples: samplesMock,
  getAudioContext: vi.fn(),
}));

import { SampleLoaderImpl } from '@core/engine/impl/SampleLoaderImpl';
import type { DualDesktop, PackState } from '@core/types/desktop';

function makeDesktop(overrides: Partial<DualDesktop> = {}): DualDesktop {
  return {
    getPaths: vi.fn(),
    listUserDir: vi.fn().mockResolvedValue([]),
    getPackStates: vi.fn().mockResolvedValue([]),
    installPack: vi.fn(),
    uninstallPack: vi.fn(),
    onPackProgress: vi.fn(),
    openProjectDialog: vi.fn(),
    saveProjectDialog: vi.fn(),
    writeFile: vi.fn(),
    getLastProject: vi.fn(),
    readProjectFile: vi.fn(),
    setLastProject: vi.fn(),
    setDirty: vi.fn(),
    confirmSaved: vi.fn(),
    gitCommit: vi.fn(),
    gitPush: vi.fn(),
    gitFindRepoRoot: vi.fn(),
    gitPull: vi.fn(),
    gitSetRemote: vi.fn(),
    onMenuAction: vi.fn(),
    ...overrides,
  };
}

function setDesktop(desktop?: DualDesktop): void {
  vi.stubGlobal('window', { dualDesktop: desktop });
}

/** Builds a minimal `Response`-shaped stub for the manifest `fetch()` call. */
function fetchOk(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

const VCSL_ENTRY = {
  id: 'vcsl-aerophones',
  version: 'v1',
  url: 'https://example.com/vcsl-aerophones-v1.zip',
  sha256: 'deadbeef',
  sizeBytes: 123,
  map: 'vcsl.json',
  // vcsl.json's own paths already start with the family folder (e.g.
  // "Aerophones/…") — base stays the shared 'VCSL/' root, not
  // family-scoped, or resolved URLs would double up the folder name.
  base: 'VCSL/',
};

const TIDAL_ENTRY = {
  id: 'tidal-drum-machines',
  version: 'v1',
  url: 'https://example.com/tidal-drum-machines-v1.zip',
  sha256: 'cafef00d',
  sizeBytes: 456,
  maps: ['tidal-drum-machines.json', 'EmuSP12.json'],
  base: 'machines/',
};

function installedState(id: string, sizeBytes = 100): PackState {
  return { id, status: 'installed', version: 'v1', sizeBytes };
}

describe('SampleLoaderImpl.loadInstalledPack', () => {
  let loader: SampleLoaderImpl;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    loader = new SampleLoaderImpl();
    samplesMock.mockClear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a no-op (does not call fetch/samples) without window.dualDesktop (plain browser)', async () => {
    setDesktop(undefined);

    await loader.loadInstalledPack('vcsl-aerophones');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(samplesMock).not.toHaveBeenCalled();
  });

  it('registers the single map/base pair for a "map" (simple) pack entry', async () => {
    setDesktop(makeDesktop({ getPackStates: vi.fn().mockResolvedValue([installedState('vcsl-aerophones')]) }));
    fetchMock.mockResolvedValue(fetchOk({ packs: [VCSL_ENTRY] }));

    await loader.loadInstalledPack('vcsl-aerophones');

    expect(samplesMock).toHaveBeenCalledTimes(1);
    expect(samplesMock).toHaveBeenCalledWith(
      'dual://user/samples/vcsl-aerophones/vcsl.json',
      'dual://user/samples/vcsl-aerophones/VCSL/',
    );
  });

  it('registers each entry of a "maps" (shared-folder) pack with the SAME base', async () => {
    setDesktop(makeDesktop({ getPackStates: vi.fn().mockResolvedValue([installedState('tidal-drum-machines')]) }));
    fetchMock.mockResolvedValue(fetchOk({ packs: [TIDAL_ENTRY] }));

    await loader.loadInstalledPack('tidal-drum-machines');

    expect(samplesMock).toHaveBeenCalledTimes(2);
    const expectedBase = 'dual://user/samples/tidal-drum-machines/machines/';
    expect(samplesMock).toHaveBeenCalledWith(
      'dual://user/samples/tidal-drum-machines/tidal-drum-machines.json',
      expectedBase,
    );
    expect(samplesMock).toHaveBeenCalledWith(
      'dual://user/samples/tidal-drum-machines/EmuSP12.json',
      expectedBase,
    );
  });

  it('ignores a pack installed on disk but absent from the manifest (no crash)', async () => {
    setDesktop(makeDesktop({ getPackStates: vi.fn().mockResolvedValue([installedState('some-removed-pack')]) }));
    fetchMock.mockResolvedValue(fetchOk({ packs: [VCSL_ENTRY] }));

    await expect(loader.loadInstalledPack('some-removed-pack')).resolves.toBeUndefined();
    expect(samplesMock).not.toHaveBeenCalled();
  });

  it('the onlyId filter loads only the requested pack, even when others are installed', async () => {
    setDesktop(
      makeDesktop({
        getPackStates: vi
          .fn()
          .mockResolvedValue([installedState('vcsl-aerophones'), installedState('tidal-drum-machines')]),
      }),
    );
    fetchMock.mockResolvedValue(fetchOk({ packs: [VCSL_ENTRY, TIDAL_ENTRY] }));

    await loader.loadInstalledPack('vcsl-aerophones');

    expect(samplesMock).toHaveBeenCalledTimes(1);
    expect(samplesMock).toHaveBeenCalledWith(
      'dual://user/samples/vcsl-aerophones/vcsl.json',
      'dual://user/samples/vcsl-aerophones/VCSL/',
    );
  });

  it('does not load a pack whose status is "available" (not yet installed)', async () => {
    setDesktop(
      makeDesktop({
        getPackStates: vi.fn().mockResolvedValue([{ id: 'vcsl-aerophones', status: 'available', sizeBytes: 123 }]),
      }),
    );
    fetchMock.mockResolvedValue(fetchOk({ packs: [VCSL_ENTRY] }));

    await loader.loadInstalledPack('vcsl-aerophones');

    expect(samplesMock).not.toHaveBeenCalled();
  });

  it('does not load a pack currently "installing" (in-progress, not yet complete)', async () => {
    setDesktop(
      makeDesktop({
        getPackStates: vi.fn().mockResolvedValue([{ id: 'vcsl-aerophones', status: 'installing', sizeBytes: 123 }]),
      }),
    );
    fetchMock.mockResolvedValue(fetchOk({ packs: [VCSL_ENTRY] }));

    await loader.loadInstalledPack('vcsl-aerophones');

    expect(samplesMock).not.toHaveBeenCalled();
  });

  it('swallows a manifest fetch failure (non-ok response) without throwing', async () => {
    setDesktop(makeDesktop({ getPackStates: vi.fn().mockResolvedValue([installedState('vcsl-aerophones')]) }));
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) } as Response);

    await expect(loader.loadInstalledPack('vcsl-aerophones')).resolves.toBeUndefined();
    expect(samplesMock).not.toHaveBeenCalled();
  });

  it('swallows a getPackStates() rejection without throwing', async () => {
    setDesktop(makeDesktop({ getPackStates: vi.fn().mockRejectedValue(new Error('IPC channel closed')) }));
    fetchMock.mockResolvedValue(fetchOk({ packs: [VCSL_ENTRY] }));

    await expect(loader.loadInstalledPack('vcsl-aerophones')).resolves.toBeUndefined();
    expect(samplesMock).not.toHaveBeenCalled();
  });

  it('accepts a bare-array manifest response (no `packs` wrapper)', async () => {
    setDesktop(makeDesktop({ getPackStates: vi.fn().mockResolvedValue([installedState('vcsl-aerophones')]) }));
    fetchMock.mockResolvedValue(fetchOk([VCSL_ENTRY]));

    await loader.loadInstalledPack('vcsl-aerophones');

    expect(samplesMock).toHaveBeenCalledTimes(1);
  });
});
