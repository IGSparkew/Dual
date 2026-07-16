export interface SampleLoader {
  /**
   * Register the default dough-samples packs vendored under public/samples/.
   * Maps register synchronously; audio files stay lazy-loaded until first play.
   * Idempotent — safe to call multiple times.
   */
  loadDefaults(): Promise<void>;
  /**
   * Register a single tier-2 pack that has just been installed under
   * userdata/samples/<id>/ (see getPackStates()), without restarting the app.
   * Called by the sample-packs UI right after installPack(id) resolves.
   * No-op in a plain browser (no window.dualDesktop) or if the id is unknown to
   * packs-manifest.json. Idempotent — samples() merges/overwrites map entries.
   */
  loadInstalledPack(id: string): Promise<void>;
  /**
   * Unregister a tier-2 pack's sounds from superdough's sound map — call right
   * after window.dualDesktop.uninstallPack(id) resolves, so getSoundNames()
   * (and onSoundsChanged() subscribers) stop listing sounds whose files no
   * longer exist on disk. No-op if the pack was never loaded this session
   * (e.g. the app was just started and the pack was uninstalled before any
   * module queried its sounds).
   */
  unloadPack(id: string): void;
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
