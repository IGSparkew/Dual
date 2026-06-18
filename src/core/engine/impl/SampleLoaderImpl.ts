import type { SampleLoader } from '../SampleLoader';

// Tracks blob URLs created for registered files so they can be revoked on demand
const blobUrls = new Map<string, string>();

export class SampleLoaderImpl implements SampleLoader {
  private cache = new Map<string, AudioBuffer>();

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
