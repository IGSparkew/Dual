/**
 * Tests for `electron/packs.ts` — `getPackStates()`/`installPack()`, the
 * download/verify/extract pipeline behind the on-demand tier-2 sample pack
 * install flow (VCSL, tidal-drum-machines, see packs-manifest.json).
 *
 * Style/approach mirrors `electron/appState.test.ts` (real temp dirs via
 * `os.tmpdir()`, only `./paths` mocked to point at them) and `electron/git.test.ts`
 * (`vi.hoisted` mocks for the external dependency so identities stay stable
 * across re-imports). Additionally here:
 *  - `electron` (`net.request`) and `unzipper` (`.Extract`) are mocked —
 *    no real network request or real zip parsing ever happens; a real
 *    `node:stream` Writable stands in for the extraction sink so the
 *    genuine pipe()/close event plumbing is exercised.
 *  - `node:fs/promises`' `statfs` alone is overridden (rest passed through via
 *    `importOriginal`) so disk-space scenarios are controllable while every
 *    other fs call (mkdir/readFile/writeFile/unlink/rm) hits the real temp dir.
 *  - `packs.ts` keeps its "packs currently installing" tracking in a
 *    module-level `Set`, so each test calls `vi.resetModules()` then
 *    re-imports `./packs` fresh — this is what gives every test its own,
 *    unpolluted `installing` state instead of leaking across tests.
 *
 * The real download stream is driven manually: `net.request(url)` returns a
 * fake, event-emitter-shaped request object captured by the test, which then
 * fires `'response'` (a fake response, itself firing `'data'`/`'end'`) at the
 * moment of the test's choosing — this is what lets a single test pause
 * mid-download (to assert "installing" state or "already installing"
 * rejection) before letting it finish or fail.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import type { PackProgress } from '../../electron/packs';

const { netRequestMock, unzipperExtractMock, statfsMock } = vi.hoisted(() => ({
  netRequestMock: vi.fn(),
  unzipperExtractMock: vi.fn(),
  statfsMock: vi.fn(),
}));

vi.mock('electron', () => ({ net: { request: netRequestMock } }));
vi.mock('unzipper', () => ({ default: { Extract: unzipperExtractMock } }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const mocked = { ...actual, statfs: statfsMock };
  return { ...mocked, default: mocked };
});

let coreDir: string;
let userDir: string;

vi.mock('../../electron/paths', () => ({
  getCoreSamplesDir: () => coreDir,
  getUserDataRoot: () => userDir,
}));

// --- Fake event-emitter helpers standing in for Electron's net.request/response ---

type Listener = (...args: unknown[]) => void;

function makeEmitter() {
  const listeners: Record<string, Listener[]> = {};
  return {
    on(event: string, cb: Listener) {
      (listeners[event] ??= []).push(cb);
      return this;
    },
    emit(event: string, ...args: unknown[]) {
      (listeners[event] ?? []).forEach((cb) => cb(...args));
    },
  };
}

function makeControllableRequest() {
  const emitter = makeEmitter();
  const request = { on: emitter.on.bind(emitter), end: vi.fn() };
  return { request, emitReqEvent: emitter.emit.bind(emitter) };
}

function makeResponse(statusCode: number, headers: Record<string, string> = {}) {
  const emitter = makeEmitter();
  return {
    statusCode,
    headers,
    resume: vi.fn(),
    on: emitter.on.bind(emitter),
    emit: emitter.emit.bind(emitter),
  };
}

/** A Writable that just drains everything written to it — stands in for
 *  `unzipper.Extract()`'s destination stream without touching real zip data. */
function makeDrainWritable() {
  return new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
}

function sha256Hex(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

interface ManifestEntryFixture {
  id: string;
  version: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  map?: string;
  maps?: string[];
  base: string;
}

function writeManifest(entries: ManifestEntryFixture[]): void {
  fs.writeFileSync(
    path.join(coreDir, 'packs-manifest.json'),
    JSON.stringify({ version: 1, packs: entries }, null, 2),
    'utf-8',
  );
}

function packDestDir(id: string): string {
  return path.join(userDir, 'samples', id);
}

function tmpZipPath(id: string, version: string): string {
  return path.join(userDir, 'samples', '.tmp', `${id}-${version}.zip`);
}

describe('electron/packs.ts', () => {
  beforeEach(() => {
    coreDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dual-packs-core-'));
    userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dual-packs-user-'));
    netRequestMock.mockReset();
    unzipperExtractMock.mockReset().mockImplementation(() => makeDrainWritable());
    statfsMock.mockReset().mockResolvedValue({ bavail: 100_000_000, bsize: 4096 }); // ~400 GB free by default
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(coreDir, { recursive: true, force: true });
    fs.rmSync(userDir, { recursive: true, force: true });
  });

  describe('getPackStates', () => {
    it('reports "available" for a manifest pack with no .pack-version on disk', async () => {
      writeManifest([
        { id: 'pack-a', version: 'v1', url: 'https://x/a.zip', sha256: 'x', sizeBytes: 42, map: 'a.json', base: 'A/' },
      ]);
      const { getPackStates } = await import('../../electron/packs');

      expect(await getPackStates()).toEqual([{ id: 'pack-a', status: 'available', sizeBytes: 42 }]);
    });

    it('reports "installed" with the trimmed on-disk version when .pack-version is present', async () => {
      writeManifest([
        { id: 'pack-a', version: 'v2', url: 'https://x/a.zip', sha256: 'x', sizeBytes: 42, map: 'a.json', base: 'A/' },
      ]);
      fs.mkdirSync(packDestDir('pack-a'), { recursive: true });
      fs.writeFileSync(path.join(packDestDir('pack-a'), '.pack-version'), 'v2\n', 'utf-8');
      const { getPackStates } = await import('../../electron/packs');

      expect(await getPackStates()).toEqual([{ id: 'pack-a', status: 'installed', version: 'v2', sizeBytes: 42 }]);
    });

    it('combines several manifest packs independently (mixed installed/available)', async () => {
      writeManifest([
        { id: 'pack-a', version: 'v1', url: 'https://x/a.zip', sha256: 'x', sizeBytes: 10, map: 'a.json', base: 'A/' },
        { id: 'pack-b', version: 'v1', url: 'https://x/b.zip', sha256: 'y', sizeBytes: 20, map: 'b.json', base: 'B/' },
      ]);
      fs.mkdirSync(packDestDir('pack-b'), { recursive: true });
      fs.writeFileSync(path.join(packDestDir('pack-b'), '.pack-version'), 'v1', 'utf-8');
      const { getPackStates } = await import('../../electron/packs');

      expect(await getPackStates()).toEqual([
        { id: 'pack-a', status: 'available', sizeBytes: 10 },
        { id: 'pack-b', status: 'installed', version: 'v1', sizeBytes: 20 },
      ]);
    });

    it('reports "installing" (in-memory) with priority over disk state while a download is in flight', async () => {
      const content = Buffer.from('irrelevant, install never completes in this test');
      writeManifest([
        {
          id: 'pack-a',
          version: 'v1',
          url: 'https://x/a.zip',
          sha256: sha256Hex(content),
          sizeBytes: 99,
          map: 'a.json',
          base: 'A/',
        },
      ]);
      const { getPackStates, installPack } = await import('../../electron/packs');

      let captured: ReturnType<typeof makeControllableRequest>;
      netRequestMock.mockImplementation(() => {
        captured = makeControllableRequest();
        return captured.request;
      });

      const installPromise = installPack('pack-a', () => {});
      await vi.waitFor(() => expect(netRequestMock).toHaveBeenCalled());

      expect(await getPackStates()).toEqual([{ id: 'pack-a', status: 'installing', sizeBytes: 99 }]);

      // Let it fail cleanly so the test doesn't leave a dangling promise/timer.
      captured!.emitReqEvent('error', new Error('aborted for test cleanup'));
      await expect(installPromise).rejects.toThrow();
      expect(await getPackStates()).toEqual([{ id: 'pack-a', status: 'available', sizeBytes: 99 }]);
    });
  });

  describe('installPack', () => {
    function driveSuccessfulDownload(
      captured: ReturnType<typeof makeControllableRequest>,
      content: Buffer,
    ): void {
      const response = makeResponse(200, { 'content-length': String(content.length) });
      captured.emitReqEvent('response', response);
      response.emit('data', content);
      response.emit('end');
    }

    it('downloads, verifies, extracts and marks a new pack installed end-to-end', async () => {
      const content = Buffer.from('fake zip bytes for pack-a');
      writeManifest([
        {
          id: 'pack-a',
          version: 'v1',
          url: 'https://x/a.zip',
          sha256: sha256Hex(content),
          sizeBytes: content.length,
          map: 'a.json',
          base: 'A/',
        },
      ]);
      const { installPack, getPackStates } = await import('../../electron/packs');

      let captured: ReturnType<typeof makeControllableRequest>;
      netRequestMock.mockImplementation(() => {
        captured = makeControllableRequest();
        return captured.request;
      });

      const progress: string[] = [];
      const installPromise = installPack('pack-a', (p: PackProgress) => progress.push(p.phase));
      await vi.waitFor(() => expect(netRequestMock).toHaveBeenCalled());
      driveSuccessfulDownload(captured!, content);

      await installPromise;

      expect(netRequestMock).toHaveBeenCalledWith('https://x/a.zip');
      expect(progress[progress.length - 1]).toBe('done');
      expect(progress).toContain('downloading');
      expect(progress).toContain('verifying');
      expect(progress).toContain('extracting');

      expect(fs.readFileSync(path.join(packDestDir('pack-a'), '.pack-version'), 'utf-8')).toBe('v1');
      expect(fs.existsSync(tmpZipPath('pack-a', 'v1'))).toBe(false);
      expect(await getPackStates()).toEqual([{ id: 'pack-a', status: 'installed', version: 'v1', sizeBytes: content.length }]);
    });

    it('rejects immediately (no download) when already installed at the manifest version', async () => {
      writeManifest([
        { id: 'pack-a', version: 'v1', url: 'https://x/a.zip', sha256: 'x', sizeBytes: 10, map: 'a.json', base: 'A/' },
      ]);
      fs.mkdirSync(packDestDir('pack-a'), { recursive: true });
      fs.writeFileSync(path.join(packDestDir('pack-a'), '.pack-version'), 'v1', 'utf-8');
      const { installPack } = await import('../../electron/packs');

      await expect(installPack('pack-a', () => {})).rejects.toThrow(/already installed/i);
      expect(netRequestMock).not.toHaveBeenCalled();
    });

    it('proceeds (does not reject) when installed at an OLDER version than the manifest', async () => {
      const content = Buffer.from('v2 bytes');
      writeManifest([
        {
          id: 'pack-a',
          version: 'v2',
          url: 'https://x/a.zip',
          sha256: sha256Hex(content),
          sizeBytes: content.length,
          map: 'a.json',
          base: 'A/',
        },
      ]);
      fs.mkdirSync(packDestDir('pack-a'), { recursive: true });
      fs.writeFileSync(path.join(packDestDir('pack-a'), '.pack-version'), 'v1', 'utf-8');
      const { installPack } = await import('../../electron/packs');

      let captured: ReturnType<typeof makeControllableRequest>;
      netRequestMock.mockImplementation(() => {
        captured = makeControllableRequest();
        return captured.request;
      });

      const installPromise = installPack('pack-a', () => {});
      await vi.waitFor(() => expect(netRequestMock).toHaveBeenCalled());
      driveSuccessfulDownload(captured!, content);

      await expect(installPromise).resolves.toBeUndefined();
      expect(fs.readFileSync(path.join(packDestDir('pack-a'), '.pack-version'), 'utf-8')).toBe('v2');
    });

    it('rejects with "unknown sample pack" for an id absent from the manifest', async () => {
      writeManifest([]);
      const { installPack } = await import('../../electron/packs');

      await expect(installPack('ghost-pack', () => {})).rejects.toThrow(/unknown sample pack/i);
      expect(netRequestMock).not.toHaveBeenCalled();
    });

    it('rejects a second concurrent install of the same pack while the first is still in flight', async () => {
      const content = Buffer.from('slow download');
      writeManifest([
        {
          id: 'pack-a',
          version: 'v1',
          url: 'https://x/a.zip',
          sha256: sha256Hex(content),
          sizeBytes: content.length,
          map: 'a.json',
          base: 'A/',
        },
      ]);
      const { installPack } = await import('../../electron/packs');

      let captured: ReturnType<typeof makeControllableRequest>;
      netRequestMock.mockImplementation(() => {
        captured = makeControllableRequest();
        return captured.request;
      });

      const first = installPack('pack-a', () => {});
      await vi.waitFor(() => expect(netRequestMock).toHaveBeenCalled());

      await expect(installPack('pack-a', () => {})).rejects.toThrow(/already installing/i);
      // Only the first call ever talked to the network.
      expect(netRequestMock).toHaveBeenCalledTimes(1);

      driveSuccessfulDownload(captured!, content);
      await expect(first).resolves.toBeUndefined();
    });

    it('fails with a checksum-mismatch error and cleans up the partial temp file', async () => {
      const content = Buffer.from('actual downloaded bytes');
      writeManifest([
        {
          id: 'pack-a',
          version: 'v1',
          url: 'https://x/a.zip',
          sha256: 'not-the-real-hash-0000000000000000000000000000000000000000',
          sizeBytes: content.length,
          map: 'a.json',
          base: 'A/',
        },
      ]);
      const { installPack, getPackStates } = await import('../../electron/packs');

      let captured: ReturnType<typeof makeControllableRequest>;
      netRequestMock.mockImplementation(() => {
        captured = makeControllableRequest();
        return captured.request;
      });

      const installPromise = installPack('pack-a', () => {});
      await vi.waitFor(() => expect(netRequestMock).toHaveBeenCalled());
      driveSuccessfulDownload(captured!, content);

      await expect(installPromise).rejects.toThrow(/checksum mismatch/i);

      expect(fs.existsSync(tmpZipPath('pack-a', 'v1'))).toBe(false);
      expect(fs.existsSync(packDestDir('pack-a'))).toBe(false);
      // "installing" flag must be cleared even on failure.
      expect(await getPackStates()).toEqual([{ id: 'pack-a', status: 'available', sizeBytes: content.length }]);
    });

    it('fails with a disk-space error and never touches the network when statfs reports too little free space', async () => {
      statfsMock.mockResolvedValue({ bavail: 1, bsize: 1 }); // ~1 byte free
      writeManifest([
        {
          id: 'pack-a',
          version: 'v1',
          url: 'https://x/a.zip',
          sha256: 'x',
          sizeBytes: 10_000_000,
          map: 'a.json',
          base: 'A/',
        },
      ]);
      const { installPack } = await import('../../electron/packs');

      await expect(installPack('pack-a', () => {})).rejects.toThrow(/not enough free disk space/i);
      expect(netRequestMock).not.toHaveBeenCalled();
      expect(fs.existsSync(packDestDir('pack-a'))).toBe(false);
    });

    it('does NOT block installation when statfs itself fails (proceeds and installs successfully)', async () => {
      statfsMock.mockRejectedValue(new Error('ENOSYS: statfs not supported on this platform'));
      const content = Buffer.from('bytes despite unavailable statfs');
      writeManifest([
        {
          id: 'pack-a',
          version: 'v1',
          url: 'https://x/a.zip',
          sha256: sha256Hex(content),
          sizeBytes: content.length,
          map: 'a.json',
          base: 'A/',
        },
      ]);
      const { installPack } = await import('../../electron/packs');

      let captured: ReturnType<typeof makeControllableRequest>;
      netRequestMock.mockImplementation(() => {
        captured = makeControllableRequest();
        return captured.request;
      });

      const installPromise = installPack('pack-a', () => {});
      await vi.waitFor(() => expect(netRequestMock).toHaveBeenCalled());
      driveSuccessfulDownload(captured!, content);

      await expect(installPromise).resolves.toBeUndefined();
      expect(fs.existsSync(path.join(packDestDir('pack-a'), '.pack-version'))).toBe(true);
    });

    it('fails with an HTTP error and cleans up when the response status is not 200', async () => {
      writeManifest([
        { id: 'pack-a', version: 'v1', url: 'https://x/a.zip', sha256: 'x', sizeBytes: 10, map: 'a.json', base: 'A/' },
      ]);
      const { installPack, getPackStates } = await import('../../electron/packs');

      let captured: ReturnType<typeof makeControllableRequest>;
      netRequestMock.mockImplementation(() => {
        captured = makeControllableRequest();
        return captured.request;
      });

      const installPromise = installPack('pack-a', () => {});
      await vi.waitFor(() => expect(netRequestMock).toHaveBeenCalled());
      const response = makeResponse(404);
      captured!.emitReqEvent('response', response);

      await expect(installPromise).rejects.toThrow(/HTTP 404/);
      expect(fs.existsSync(packDestDir('pack-a'))).toBe(false);
      expect(await getPackStates()).toEqual([{ id: 'pack-a', status: 'available', sizeBytes: 10 }]);
    });

    it('cleans up the partial destination folder when extraction itself fails', async () => {
      const content = Buffer.from('valid bytes, broken zip');
      writeManifest([
        {
          id: 'pack-a',
          version: 'v1',
          url: 'https://x/a.zip',
          sha256: sha256Hex(content),
          sizeBytes: content.length,
          map: 'a.json',
          base: 'A/',
        },
      ]);
      unzipperExtractMock.mockImplementation(
        () =>
          new Writable({
            write(_chunk, _enc, cb) {
              cb(new Error('corrupt archive'));
            },
          }),
      );
      const { installPack, getPackStates } = await import('../../electron/packs');

      let captured: ReturnType<typeof makeControllableRequest>;
      netRequestMock.mockImplementation(() => {
        captured = makeControllableRequest();
        return captured.request;
      });

      const installPromise = installPack('pack-a', () => {});
      await vi.waitFor(() => expect(netRequestMock).toHaveBeenCalled());
      driveSuccessfulDownload(captured!, content);

      await expect(installPromise).rejects.toThrow(/corrupt archive/);

      expect(fs.existsSync(packDestDir('pack-a'))).toBe(false);
      expect(fs.existsSync(tmpZipPath('pack-a', 'v1'))).toBe(false);
      expect(await getPackStates()).toEqual([{ id: 'pack-a', status: 'available', sizeBytes: content.length }]);
    });

    it('reports an error progress event with the failure message before rethrowing', async () => {
      const content = Buffer.from('mismatched content');
      writeManifest([
        {
          id: 'pack-a',
          version: 'v1',
          url: 'https://x/a.zip',
          sha256: 'wrong-hash',
          sizeBytes: content.length,
          map: 'a.json',
          base: 'A/',
        },
      ]);
      const { installPack } = await import('../../electron/packs');

      let captured: ReturnType<typeof makeControllableRequest>;
      netRequestMock.mockImplementation(() => {
        captured = makeControllableRequest();
        return captured.request;
      });

      const progress: Array<{ phase: string; message?: string }> = [];
      const installPromise = installPack('pack-a', (p: PackProgress) => progress.push({ phase: p.phase, message: p.message }));
      await vi.waitFor(() => expect(netRequestMock).toHaveBeenCalled());
      driveSuccessfulDownload(captured!, content);

      await expect(installPromise).rejects.toThrow();

      const errorEvent = progress.find((p) => p.phase === 'error');
      expect(errorEvent?.message).toMatch(/checksum mismatch/i);
    });
  });
});
