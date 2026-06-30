export interface SampleLoader {
  /**
   * Register the default dough-samples packs vendored under public/samples/.
   * Maps register synchronously; audio files stay lazy-loaded until first play.
   * Idempotent — safe to call multiple times.
   */
  loadDefaults(): Promise<void>;
  load(url: string): Promise<AudioBuffer>;
  loadFromFile(file: File): Promise<AudioBuffer>;
  /** Register a file as a named Strudel sample. Returns the name to use in s("name"). */
  registerFile(file: File, name?: string): Promise<string>;
  preload(urls: string[]): Promise<void>;
}
