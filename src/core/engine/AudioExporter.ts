export interface AudioExporter {
  /**
   * Render the current pattern to a WAV file via an OfflineAudioContext and
   * trigger a browser download.
   *
   * @param cycles       Number of Strudel cycles to render (rendered from 0).
   * @param filenameHint Base name for the downloaded file (`.wav` is appended).
   */
  exportWav(cycles: number, filenameHint: string): Promise<void>;
}
