import type { SampleLoader } from '../SampleLoader';
import type { DualDesktop } from '@core/types/desktop';
// Static import is safe here: superdough's module evaluation is pure JS — the
// AudioContext is only created lazily inside getAudioContext(). It is also the
// SAME module instance the dynamically imported @strudel/webaudio writes into
// (webaudio's dist externalizes superdough via `export * from 'superdough'`),
// so this store reflects everything samples() registers. We import it directly
// (not via @strudel/webaudio) so getSoundNames() can stay synchronous without
// eagerly pulling the whole webaudio/core/draw chain at startup.
import { soundMap } from 'superdough';

/**
 * Minimal typed view of superdough's `soundMap` (a nanostores map, see
 * node_modules/superdough/superdough.mjs `export const soundMap = map()`).
 *
 * Shape: `Record<soundName, { onTrigger, data }>` where `data` is e.g.
 * `{ type: 'sample', samples: string[] | Record<note, string[]>, baseUrl }`
 * for sample packs or `{ type: 'synth', prebake: true }` for built-in synths.
 * Keys are LOWERCASED by registerSound (whitespace → `_`): the
 * tidal-drum-machines pack maps `RolandTR909_bd` in its json, stored as
 * `rolandtr909_bd` (`<machine>_<instrument>`). Residual meta keys like `_base`
 * from user-provided maps are NOT filtered by superdough, hence our `_` filter.
 */
interface SoundMapStore {
  get(): Record<string, unknown>;
  /** nanostores listen: fires on each setKey/set, returns an unbind function. */
  listen(cb: (sounds: Record<string, unknown>) => void): () => void;
}

const soundStore = soundMap as SoundMapStore;

// Tracks blob URLs created for registered files so they can be revoked on demand
const blobUrls = new Map<string, string>();

// Tier-1 dough-samples packs vendored under public/samples/ (run scripts/vendor-samples.mjs).
// Each entry: the strudel.json map + the folder its relative paths resolve against.
// Heavier tier-2 packs (VCSL, tidal-drum-machines, EmuSP12) are no longer bundled —
// they are opt-in downloads installed into userdata/samples/<id>/ and picked up by
// loadInstalledPacks() from packs-manifest.json (see below).
const PACKS: ReadonlyArray<{ map: string; base: string }> = [
  { map: 'Dirt-Samples.json', base: 'Dirt-Samples/' }, // bd sd hh cp…
  { map: 'piano.json', base: 'piano/' }, // note(...).s("piano")
  { map: 'mridangam.json', base: 'mrid/' }, // indian percussion
];

/**
 * One entry of packs-manifest.json (bundled in public/samples/, served via
 * dual://core/samples/). getPackStates() only returns runtime status (id +
 * installed/available/installing), so we read the manifest here to learn WHICH
 * maps a given pack ships and the base folder its wav paths resolve against.
 */
interface RemotePackManifestEntry {
  id: string;
  version: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  /** Simple case: a single json map. */
  map?: string;
  /** Shared case: several json maps pointing at the same wav folder
   *  (e.g. tidal-drum-machines shares its folder with EmuSP12). */
  maps?: string[];
  /** Pack-relative folder the map's paths resolve against. */
  base: string;
}

export class SampleLoaderImpl implements SampleLoader {
  private cache = new Map<string, AudioBuffer>();
  private defaultsLoaded = false;

  async loadDefaults(): Promise<void> {
    if (this.defaultsLoaded) return;
    const { samples } = await import('@strudel/webaudio');

    // Under Electron the dual:// protocol serves core samples from disk (public/samples
    // in dev, resources/samples when packaged). Plain browser: served by Vite from public/.
    const desktop = window.dualDesktop;
    const root = desktop ? 'dual://core/samples/' : `${import.meta.env.BASE_URL}samples/`;

    // The 2nd arg is the LOCAL base; it overrides any `_base` left in the json
    // (the vendor script strips `_base` anyway — belt and suspenders). Maps
    // register instantly; audio files stay lazy-loaded until first play.
    await Promise.all(PACKS.map(({ map, base }) => samples(root + map, root + base)));
    if (desktop) {
      await this.loadUserPacks(desktop, samples);
      // Tier-2 packs the user has already installed into userdata/samples/<id>/.
      await this.loadInstalledPacks(desktop, samples);
    }
    this.defaultsLoaded = true;
  }

  async loadInstalledPack(id: string): Promise<void> {
    const desktop = window.dualDesktop;
    if (!desktop) return; // plain browser: tier-2 packs are unavailable
    const { samples } = await import('@strudel/webaudio');
    await this.loadInstalledPacks(desktop, samples, id);
  }

  // Reads packs-manifest.json (bundled) to know each pack's map(s)/base, and
  // getPackStates() to know which are installed. Registers every installed
  // pack's map(s) from userdata/samples/<id>/. Pass `onlyId` to load a single
  // freshly-installed pack (loadInstalledPack). Idempotent: samples() merges.
  private async loadInstalledPacks(
    desktop: DualDesktop,
    samples: (map: string, base?: string) => Promise<void>,
    onlyId?: string,
  ): Promise<void> {
    const root = 'dual://user/samples/';
    try {
      const [states, manifest] = await Promise.all([
        desktop.getPackStates(),
        this.fetchPackManifest(),
      ]);
      const byId = new Map(manifest.map((entry) => [entry.id, entry]));
      const targets = states.filter(
        (s) => s.status === 'installed' && (onlyId === undefined || s.id === onlyId),
      );
      await Promise.all(
        targets.flatMap((state) => {
          const entry = byId.get(state.id);
          if (!entry) return []; // installed on disk but absent from manifest — skip
          // dual://user/samples/<id>/<base> and .../<map> — same shape as loadDefaults.
          const packRoot = `${root}${state.id}/`;
          const base = packRoot + entry.base;
          // Shared-folder packs list several maps against one base: one samples()
          // call per map, same base each time.
          const mapNames = entry.maps ?? (entry.map ? [entry.map] : []);
          return mapNames.map((map) => samples(packRoot + map, base));
        }),
      );
    } catch (error) {
      console.error('Failed to load installed sample packs:', error);
    }
  }

  // packs-manifest.json lives in public/samples/, served by dual://core/samples/.
  // Re-fetched per call (cheap local read) so it always reflects the shipped
  // manifest — no stale empty-cache trap when a pack is installed post-startup.
  private async fetchPackManifest(): Promise<RemotePackManifestEntry[]> {
    try {
      const res = await fetch('dual://core/samples/packs-manifest.json');
      if (!res.ok) return [];
      const json: unknown = await res.json();
      // Accept either a bare array or a { packs: [...] } wrapper.
      if (Array.isArray(json)) return json as RemotePackManifestEntry[];
      const packs = (json as { packs?: unknown }).packs;
      return Array.isArray(packs) ? (packs as RemotePackManifestEntry[]) : [];
    } catch {
      return []; // manifest not present yet (e.g. bundle without packs) — no tier-2
    }
  }

  // User packs: any strudel.json map dropped at the root of userdata/samples,
  // with relative paths resolved against that same folder.
  private async loadUserPacks(
    desktop: DualDesktop,
    samples: (map: string, base?: string) => Promise<void>,
  ): Promise<void> {
    const root = 'dual://user/samples/';
    try {
      const maps = (await desktop.listUserDir('samples')).filter((f) => f.endsWith('.json'));
      await Promise.all(maps.map((map) => samples(root + map, root)));
    } catch (error) {
      console.error('Failed to load user sample packs:', error);
    }
  }

  async load(url: string): Promise<AudioBuffer> {
    const cached = this.cache.get(url);
    if (cached) return cached;

    const ctx = await this.getContext();
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch sample: ${url} (${response.status})`);

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    this.cache.set(url, audioBuffer);
    return audioBuffer;
  }

  async loadFromFile(file: File): Promise<AudioBuffer> {
    const cacheKey = `file:${file.name}:${file.size}:${file.lastModified}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const ctx = await this.getContext();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    this.cache.set(cacheKey, audioBuffer);
    return audioBuffer;
  }

  async registerFile(file: File, name?: string): Promise<string> {
    const sampleName = name ?? file.name.replace(/\.[^.]+$/, '');
    const existing = blobUrls.get(sampleName);
    if (existing) URL.revokeObjectURL(existing);

    const blobUrl = URL.createObjectURL(file);
    blobUrls.set(sampleName, blobUrl);

    const { samples } = await import('@strudel/webaudio');
    await samples({ [sampleName]: [blobUrl] });

    return sampleName;
  }

  async preload(urls: string[]): Promise<void> {
    await Promise.all(urls.map((url) => this.load(url)));
  }

  getSoundNames(): string[] {
    return Object.keys(soundStore.get())
      .filter((name) => !name.startsWith('_'))
      .sort();
  }

  onSoundsChanged(cb: (names: string[]) => void): () => void {
    // samples() registers one store key per sound, so loading a pack fires
    // hundreds of synchronous notifications. Coalesce them into a single
    // callback per microtask to keep subscribers cheap.
    let scheduled = false;
    let disposed = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        if (!disposed) cb(this.getSoundNames());
      });
    };
    const unbind = soundStore.listen(schedule);
    // Replay the current list on subscribe (same coalesced path): nanostores'
    // listen does not emit the current value, so a pack registered between a
    // caller's initial getSoundNames() read and this subscription would
    // otherwise be lost.
    schedule();
    return () => {
      disposed = true;
      unbind();
    };
  }

  private async getContext(): Promise<AudioContext> {
    const { getAudioContext } = await import('@strudel/webaudio');
    const ctx = getAudioContext();
    if (!ctx) throw new Error('AudioContext not available — call StrudelBridge.init() first');
    return ctx;
  }
}

export const sampleLoader: SampleLoader = new SampleLoaderImpl();
