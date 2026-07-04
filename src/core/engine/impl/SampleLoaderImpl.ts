import type { SampleLoader } from '../SampleLoader';
import type { DualDesktop } from '@core/types/desktop';

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

  private async getContext(): Promise<AudioContext> {
    const { getAudioContext } = await import('@strudel/webaudio');
    const ctx = getAudioContext();
    if (!ctx) throw new Error('AudioContext not available — call StrudelBridge.init() first');
    return ctx;
  }
}

export const sampleLoader: SampleLoader = new SampleLoaderImpl();
