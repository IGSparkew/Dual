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

// dough-samples packs vendored under public/samples/ (run scripts/vendor-samples.mjs).
// Each entry: the strudel.json map + the folder its relative paths resolve against.
// NB: tidal-drum-machines and EmuSP12 share the same base folder — both maps merge there.
const PACKS: ReadonlyArray<{ map: string; base: string }> = [
  { map: 'Dirt-Samples.json', base: 'Dirt-Samples/' }, // bd sd hh cp…
  { map: 'piano.json', base: 'piano/' }, // note(...).s("piano")
  { map: 'vcsl.json', base: 'VCSL/' }, // assorted instruments
  { map: 'tidal-drum-machines.json', base: 'tidal-drum-machines/machines/' }, // .bank("RolandTR909")
  { map: 'EmuSP12.json', base: 'tidal-drum-machines/machines/' }, // Emu SP-1200
  { map: 'mridangam.json', base: 'mrid/' }, // indian percussion
];

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
    if (desktop) await this.loadUserPacks(desktop, samples);
    this.defaultsLoaded = true;
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
