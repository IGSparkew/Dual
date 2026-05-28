export interface SampleLoader {
  load(url: string): Promise<AudioBuffer>;
  preload(urls: string[]): Promise<void>;
}
