import { net } from 'electron';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import unzipper from 'unzipper';
import { getCoreSamplesDir, getUserDataRoot } from './paths';

// Mirrors PackState/PackProgress in src/core/types/desktop.ts — duplicated
// locally (same precedent as ProjectFile in ipc.ts) since electron/*.ts isn't
// part of the tsconfig project that resolves the @core alias.
export interface PackState {
  id: string;
  status: 'installed' | 'available' | 'installing';
  version?: string;
  sizeBytes: number;
}

export interface PackProgress {
  packId: string;
  phase: 'downloading' | 'verifying' | 'extracting' | 'done' | 'error';
  receivedBytes: number;
  totalBytes: number;
  message?: string;
}

interface PackManifestEntry {
  id: string;
  version: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  map?: string;
  maps?: string[];
  base: string;
}

interface PacksManifest {
  version: number;
  packs: PackManifestEntry[];
}

// Tracks packIds currently mid-install (download/verify/extract) — cleared in
// installPack's `finally` regardless of success/failure.
const installing = new Set<string>();

async function readManifest(): Promise<PackManifestEntry[]> {
  const manifestPath = path.join(getCoreSamplesDir(), 'packs-manifest.json');
  const raw = await fs.readFile(manifestPath, 'utf-8');
  return (JSON.parse(raw) as PacksManifest).packs;
}

function packDir(packId: string): string {
  return path.join(getUserDataRoot(), 'samples', packId);
}

function versionFilePath(packId: string): string {
  return path.join(packDir(packId), '.pack-version');
}

async function installedVersion(packId: string): Promise<string | null> {
  try {
    return (await fs.readFile(versionFilePath(packId), 'utf-8')).trim();
  } catch {
    return null;
  }
}

export async function getPackStates(): Promise<PackState[]> {
  const packs = await readManifest();
  return Promise.all(
    packs.map(async (pack): Promise<PackState> => {
      if (installing.has(pack.id)) {
        return { id: pack.id, status: 'installing', sizeBytes: pack.sizeBytes };
      }
      const version = await installedVersion(pack.id);
      if (version) {
        return { id: pack.id, status: 'installed', version, sizeBytes: pack.sizeBytes };
      }
      return { id: pack.id, status: 'available', sizeBytes: pack.sizeBytes };
    }),
  );
}

/** Refuses (rather than silently proceeding) if the free space on the volume
 *  hosting `root` can't cover `requiredBytes` — but if the check itself can't
 *  run (statfs unsupported/erroring on this platform), logs clearly and lets
 *  the install proceed instead of blocking on a check we can't perform. */
async function checkDiskSpace(root: string, requiredBytes: number): Promise<void> {
  let availableBytes: number;
  try {
    const stats = await fs.statfs(root);
    availableBytes = stats.bavail * stats.bsize;
  } catch (error) {
    console.error(`Disk space check failed for "${root}", proceeding without it:`, error);
    return;
  }

  if (availableBytes < requiredBytes) {
    throw new Error(
      `Not enough free disk space to install this pack — need ~${Math.ceil(
        requiredBytes / 1e6,
      )} MB, have ~${Math.ceil(availableBytes / 1e6)} MB available.`,
    );
  }
}

/** Streams `url` to `destPath` on disk (never buffered fully in memory — packs
 *  run up to ~700 MB). Reports progress via `onProgress`, throttled to avoid
 *  flooding the caller (and, transitively, the renderer over IPC). */
function downloadToFile(
  url: string,
  destPath: string,
  onProgress: (receivedBytes: number, totalBytes: number) => void,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const request = net.request(url);
    const fileStream = fsSync.createWriteStream(destPath);
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      fileStream.destroy();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        fail(new Error(`Download failed: HTTP ${response.statusCode}`));
        response.on('data', () => {}); // drain the body so the connection can close
        return;
      }

      const totalBytes = Number(response.headers['content-length'] ?? 0);
      let receivedBytes = 0;
      let lastReportedBytes = 0;
      // ~1% of the total (or 64 KiB for tiny/unknown-size responses).
      const reportThreshold = Math.max(65536, Math.floor(totalBytes / 100));

      response.on('data', (chunk: Buffer) => {
        receivedBytes += chunk.length;
        fileStream.write(chunk);
        if (receivedBytes - lastReportedBytes >= reportThreshold || receivedBytes === totalBytes) {
          lastReportedBytes = receivedBytes;
          onProgress(receivedBytes, totalBytes);
        }
      });
      response.on('end', () => fileStream.end());
      response.on('error', fail);
    });

    request.on('error', fail);
    fileStream.on('error', fail);
    fileStream.on('finish', () => {
      if (!settled) {
        settled = true;
        resolvePromise();
      }
    });

    request.end();
  });
}

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256');
    const stream = fsSync.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolvePromise(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    fsSync
      .createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: destDir }))
      .on('close', resolvePromise)
      .on('error', reject);
  });
}

/** Downloads, verifies (sha256) and extracts a tier-2 sample pack into
 *  userdata/samples/<packId>/, reporting progress through `onProgress`.
 *  Rejects (without downloading anything) if the pack is unknown, already
 *  installing, or already installed at the manifest's version. On any
 *  failure the partial temp file and extraction folder are cleaned up before
 *  re-throwing. */
export async function installPack(
  packId: string,
  onProgress: (progress: PackProgress) => void,
): Promise<void> {
  const packs = await readManifest();
  const entry = packs.find((p) => p.id === packId);
  if (!entry) throw new Error(`Unknown sample pack: ${packId}`);

  if (installing.has(packId)) {
    throw new Error(`Pack "${packId}" is already installing.`);
  }
  const currentVersion = await installedVersion(packId);
  if (currentVersion === entry.version) {
    throw new Error(`Pack "${packId}" is already installed at version ${entry.version}.`);
  }

  installing.add(packId);

  const userDataRoot = getUserDataRoot();
  const tmpDir = path.join(userDataRoot, 'samples', '.tmp');
  const tmpZipPath = path.join(tmpDir, `${packId}-${entry.version}.zip`);
  const destDir = packDir(packId);

  const report = (
    phase: PackProgress['phase'],
    receivedBytes = 0,
    totalBytes = entry.sizeBytes,
    message?: string,
  ) => onProgress({ packId, phase, receivedBytes, totalBytes, message });

  try {
    await fs.mkdir(tmpDir, { recursive: true });
    await checkDiskSpace(userDataRoot, entry.sizeBytes * 2);

    report('downloading', 0, entry.sizeBytes);
    await downloadToFile(entry.url, tmpZipPath, (received, total) =>
      report('downloading', received, total || entry.sizeBytes),
    );

    report('verifying', entry.sizeBytes, entry.sizeBytes);
    const actualHash = await sha256File(tmpZipPath);
    if (actualHash !== entry.sha256) {
      throw new Error(
        `Checksum mismatch for pack "${packId}" — expected ${entry.sha256}, got ${actualHash}.`,
      );
    }

    report('extracting', entry.sizeBytes, entry.sizeBytes);
    await fs.mkdir(destDir, { recursive: true });
    await extractZip(tmpZipPath, destDir);
    await fs.writeFile(path.join(destDir, '.pack-version'), entry.version, 'utf-8');

    await fs.unlink(tmpZipPath).catch(() => {});
    report('done', entry.sizeBytes, entry.sizeBytes);
  } catch (error) {
    await fs.unlink(tmpZipPath).catch(() => {});
    await fs.rm(destDir, { recursive: true, force: true }).catch(() => {});
    const message = error instanceof Error ? error.message : String(error);
    report('error', 0, entry.sizeBytes, message);
    throw error;
  } finally {
    installing.delete(packId);
  }
}

/** Removes userdata/samples/<packId>/ entirely. Rejects if the pack is
 *  currently installing or isn't installed (no `.pack-version` on disk) —
 *  the renderer should also call sampleLoader.unloadPack(id) afterward to
 *  drop its sounds from the running session's sound map. */
export async function uninstallPack(packId: string): Promise<void> {
  if (installing.has(packId)) {
    throw new Error(`Pack "${packId}" is currently installing — wait for it to finish.`);
  }
  const version = await installedVersion(packId);
  if (!version) {
    throw new Error(`Pack "${packId}" is not installed.`);
  }
  await fs.rm(packDir(packId), { recursive: true, force: true });
}
