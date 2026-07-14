declare module '@strudel/core';
// Subpath import: the @strudel/core barrel breaks under Node (vitest) because
// of a broken ESM `main` in a transitive dependency — util.mjs works in both.
declare module '@strudel/core/util.mjs' {
  /** Note name → MIDI number (c3 = 48, scientific convention). Throws on
   *  anything that is not a note name. */
  export function noteToMidi(note: string, defaultOctave?: number): number;
}
declare module '@strudel/mini';
declare module '@strudel/tonal';
declare module '@strudel/webaudio';
declare module '@strudel/transpiler';
declare module '@strudel/soundfonts' {
  /** Registers all General-MIDI `gm_*` sounds (gm_piano, gm_synth_bass_1, …)
   *  into superdough's soundMap. Synchronous: fonts are fetched lazily on first
   *  play from the URL set by setSoundfontUrl (default felixroos.github.io). */
  export function registerSoundfonts(): void;
  /** Base URL fonts are fetched from as `${url}/${name}.js` (no trailing slash).
   *  Point at the vendored local folder to keep runtime offline. */
  export function setSoundfontUrl(url: string): void;
}
declare module 'superdough';

declare module 'escodegen' {
  interface GenerateOptions {
    format?: {
      indent?: { style?: string };
      quotes?: 'double' | 'single' | 'auto';
    };
  }
  export function generate(ast: unknown, options?: GenerateOptions): string;
}