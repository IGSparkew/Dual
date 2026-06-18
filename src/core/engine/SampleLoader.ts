export interface SampleLoader {
  load(url: string): Promise<AudioBuffer>;
  loadFromFile(file: File): Promise<AudioBuffer>;
  /** Register a file as a named Strudel sample. Returns the name to use in s("name"). */
  registerFile(file: File, name?: string): Promise<string>;
  preload(urls: string[]): Promise<void>;
}
