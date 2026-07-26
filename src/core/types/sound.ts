/**
 * Derived view of one entry of superdough's sound map (see SampleLoaderImpl).
 *
 * Shared because three layers read it: the engine produces it, `PanelApi`
 * exposes it, and modules (browser, drum grid) render it. It is a snapshot of
 * runtime registration state — never persisted, never a source of truth.
 */
export interface SoundInfo {
  /** Sound-map key, always LOWERCASE (`bd`, `rolandtr909_bd`, `user_kick`). */
  name: string;
  /**
   * `sample` = registered by samples(); `soundfont` = a General MIDI program
   * registered by registerSoundfonts() (played like a pitched instrument, but
   * backed by a .sf2 font rather than files); `synth` = superdough built-in.
   */
  type: 'sample' | 'synth' | 'soundfont';
  /**
   * How the sound is addressed: `drum` when it is a flat list played by index
   * (`s("bd:2")`), `pitched` when it takes a note (`note("c3").s("piano")`).
   * Soundfonts are always pitched; synths are reported as `drum` — they carry
   * no bank and the browser does not list them.
   */
  kind: 'drum' | 'pitched';
  /** Variants behind the name: file count, note count, or font count. */
  variants: number;
}

/** The `user_` prefix is the ONLY marker of user provenance — no side registry. */
export const USER_SOUND_PREFIX = 'user_';
