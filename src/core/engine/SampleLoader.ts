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
  /**
   * Names of all sounds currently registered in superdough's sound map,
   * sorted alphabetically. Internal/meta keys prefixed with `_` are excluded.
   *
   * Names are LOWERCASE (superdough lowercases keys on registration) even when
   * the source pack uses CamelCase. tidal-drum-machines follows the
   * `<machine>_<instrument>` convention: `.bank("RolandTR909") + s("bd")`
   * resolves to the key `rolandtr909_bd` (lookup is case-insensitive).
   * Partial kits are common — e.g. RolandSH09 only ships `rolandsh09_bd` —
   * so the UI must derive bank availability from this list, not assume it.
   *
   * Synchronous; returns [] before any pack has been registered.
   */
  getSoundNames(): string[];
  /**
   * Subscribe to sound-map changes (packs loading, user samples registered
   * after startup via registerFile). The callback receives the same sorted,
   * `_`-filtered list as getSoundNames(). Bursts of registrations (a pack maps
   * hundreds of keys synchronously) are coalesced into a single call. Replays
   * the current list once on subscribe (also coalesced), so nothing registered
   * between an initial getSoundNames() read and the subscription is lost.
   * Returns an unsubscribe function.
   */
  onSoundsChanged(cb: (names: string[]) => void): () => void;
}
