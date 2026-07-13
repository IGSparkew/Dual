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