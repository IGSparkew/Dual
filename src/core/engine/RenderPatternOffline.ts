export interface RenderPatternOffline {
  /**
   * Render `pattern` from cycle `begin` to `end` into an AudioBuffer via an
   * OfflineAudioContext. Closes the live audio context first and leaves the
   * global context/controller null on exit (even on error) — the caller is
   * responsible for restoring live playback (strudelBridge.refreshAudioContext).
   */
  render(
    pattern: any,
    cps: number,
    begin: number,
    end: number,
    sampleRate: number,
    maxPolyphony: number,
    multiChannelOrbits: boolean,
  ): Promise<AudioBuffer>;

  /** Encode a rendered AudioBuffer as a 16-bit PCM WAV Blob. */
  toWavBlob(buffer: AudioBuffer): Blob;
}
