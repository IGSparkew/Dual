/** One effect unit of a clip's chain, as derived from the code by the emitter
 *  (structural snapshot — params keyed by canonical method name). */
export interface FxChainEntry {
  unit: string;
  params: Record<string, number | string>;
}

/**
 * Chained method names that count as audio FX — the shared document-level
 * contract between the FX Rack (which owns the rich catalog) and any module
 * that only needs to *recognize* an effect (mixer badges). Canonical names and
 * read aliases of the v1 catalog; a test in modules/effects keeps this set in
 * sync with EFFECT_CATALOG. Deliberately excludes non-FX chain methods
 * (bank, s, n, fast…), gain/pan (mixer's facet) and synthesis params.
 */
export const FX_METHODS: ReadonlySet<string> = new Set([
  // filters
  'lpf', 'cutoff', 'ctf', 'lp', 'lpq', 'resonance',
  'hpf', 'hcutoff', 'hp', 'hpq', 'hresonance',
  'bpf', 'bandf', 'bp', 'bpq', 'bandq',
  // formant
  'vowel',
  // lo-fi
  'coarse', 'crush',
  // distortion
  'distort', 'dist', 'distortvol', 'distvol',
  // modulation
  'tremolo', 'trem', 'tremolodepth', 'tremdepth',
  'phaser', 'phaserrate', 'ph', 'phaserdepth', 'phd', 'phasdp',
  // dynamics — camelCase is EXACT: superdough has no lowercase aliases here
  'compressor', 'compressorRatio', 'compressorRelease',
  // sends
  'delay', 'delaytime', 'delayt', 'dt', 'delayfeedback', 'delayfb', 'dfb',
  'room', 'roomsize', 'size', 'sz', 'rsize',
  // sidechain duck (trigger-side controls; the victim's `.orbit(n)` is plain
  // routing, deliberately NOT an FX badge)
  'duckorbit', 'duck', 'duckdepth', 'duckonset', 'duckons', 'duckattack', 'duckatt',
]);
