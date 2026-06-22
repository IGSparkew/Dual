import { type CompletionContext, type Completion, snippetCompletion } from '@codemirror/autocomplete';

// ─── Top-level functions ───────────────────────────────────────────────────

const TOP_LEVEL: Completion[] = [
  snippetCompletion('note("${}")', { label: 'note', detail: 'fn', info: 'note("c3 e3 g3")' }),
  snippetCompletion('s("${}")',    { label: 's',    detail: 'fn', info: 's("bd sd hh cp")' }),
  snippetCompletion('stack(${},\n  ${})', { label: 'stack', detail: 'fn', info: 'Layer patterns simultaneously' }),
  snippetCompletion('cat(${}, ${})',      { label: 'cat',   detail: 'fn', info: 'Concatenate patterns' }),
  snippetCompletion('seq(${}, ${})',      { label: 'seq',   detail: 'fn', info: 'Sequence patterns' }),
  snippetCompletion('sine', { label: 'sine',   detail: 'signal', info: 'Sine wave LFO' }),
  snippetCompletion('saw',  { label: 'saw',    detail: 'signal', info: 'Sawtooth wave LFO' }),
  snippetCompletion('square', { label: 'square', detail: 'signal', info: 'Square wave LFO' }),
  snippetCompletion('tri',  { label: 'tri',    detail: 'signal', info: 'Triangle wave LFO' }),
  snippetCompletion('rand', { label: 'rand',   detail: 'signal', info: 'Random signal [0–1]' }),
  snippetCompletion('perlin', { label: 'perlin', detail: 'signal', info: 'Perlin noise signal' }),
];

// ─── Chained methods ───────────────────────────────────────────────────────

const CHAINED: Completion[] = [
  // Audio
  snippetCompletion('.gain(${0.8})',          { label: '.gain',    detail: 'method', info: 'Volume — 0 to 1' }),
  snippetCompletion('.pan(${0.5})',           { label: '.pan',     detail: 'method', info: 'Stereo pan — 0 (L) to 1 (R)' }),
  snippetCompletion('.room(${0.5})',          { label: '.room',    detail: 'method', info: 'Reverb amount — 0 to 1' }),
  snippetCompletion('.delay(${0.5})',         { label: '.delay',   detail: 'method', info: 'Delay feedback — 0 to 1' }),
  snippetCompletion('.delaytime(${0.25})',    { label: '.delaytime', detail: 'method', info: 'Delay time in cycles' }),
  snippetCompletion('.delayfeedback(${0.5})',{ label: '.delayfeedback', detail: 'method' }),
  snippetCompletion('.cutoff(${500})',        { label: '.cutoff',  detail: 'method', info: 'Low-pass filter cutoff in Hz' }),
  snippetCompletion('.resonance(${10})',      { label: '.resonance', detail: 'method' }),
  snippetCompletion('.attack(${0.01})',       { label: '.attack',  detail: 'method', info: 'Envelope attack in seconds' }),
  snippetCompletion('.decay(${0.1})',         { label: '.decay',   detail: 'method' }),
  snippetCompletion('.sustain(${0.5})',       { label: '.sustain', detail: 'method' }),
  snippetCompletion('.release(${0.2})',       { label: '.release', detail: 'method' }),
  snippetCompletion('.speed(${1})',           { label: '.speed',   detail: 'method', info: 'Sample playback speed' }),
  snippetCompletion('.begin(${0})',           { label: '.begin',   detail: 'method' }),
  snippetCompletion('.end(${1})',             { label: '.end',     detail: 'method' }),
  snippetCompletion('.vowel("${a}")',         { label: '.vowel',   detail: 'method', info: 'Vowel filter — a e i o u' }),

  // Pattern transformations
  snippetCompletion('.slow(${2})',      { label: '.slow',      detail: 'method', info: 'Stretch pattern by factor' }),
  snippetCompletion('.fast(${2})',      { label: '.fast',      detail: 'method', info: 'Compress pattern by factor' }),
  snippetCompletion('.rev()',           { label: '.rev',       detail: 'method', info: 'Reverse pattern' }),
  snippetCompletion('.every(${4}, x => x.${})', { label: '.every', detail: 'method', info: 'Apply fn every N cycles' }),
  snippetCompletion('.sometimes(x => x.${})',   { label: '.sometimes', detail: 'method', info: '~50% probability' }),
  snippetCompletion('.often(x => x.${})',       { label: '.often',     detail: 'method', info: '~75% probability' }),
  snippetCompletion('.rarely(x => x.${})',      { label: '.rarely',    detail: 'method', info: '~25% probability' }),
  snippetCompletion('.jux(x => x.${})', { label: '.jux',    detail: 'method', info: 'Apply fn to right channel only' }),
  snippetCompletion('.add(${1})',       { label: '.add',    detail: 'method', info: 'Add value to pattern' }),
  snippetCompletion('.range(${0}, ${1})', { label: '.range', detail: 'method', info: 'Rescale signal to [min, max]' }),
  snippetCompletion('.segment(${8})',   { label: '.segment', detail: 'method', info: 'Sample signal N times per cycle' }),
  snippetCompletion('.struct("${x x x x}")', { label: '.struct', detail: 'method', info: 'Apply rhythmic structure' }),
  snippetCompletion('.mask("${x _ x _}")',   { label: '.mask',   detail: 'method' }),
  snippetCompletion('.euclid(${3}, ${8})',   { label: '.euclid', detail: 'method', info: 'Euclidean rhythm (k, n)' }),
  snippetCompletion('.striate(${4})',        { label: '.striate', detail: 'method' }),
  snippetCompletion('.chop(${4})',           { label: '.chop',    detail: 'method' }),
  snippetCompletion('.legato(${1})',         { label: '.legato',  detail: 'method' }),
  snippetCompletion('.bank("${RolandTR808}")', { label: '.bank',  detail: 'method', info: 'Select sample bank' }),
  snippetCompletion('.scale("${C:major}")',   { label: '.scale',  detail: 'method', info: 'Quantize to scale' }),
];

// ─── CodeMirror completion source ─────────────────────────────────────────

export function strudelCompletions(context: CompletionContext) {
  const dotMatch = context.matchBefore(/\.\w*/);
  if (dotMatch) {
    return {
      from: dotMatch.from,
      options: CHAINED,
      validFor: /^\.\w*$/,
    };
  }

  const wordMatch = context.matchBefore(/\w+/);
  if (!wordMatch && !context.explicit) return null;

  return {
    from: wordMatch ? wordMatch.from : context.pos,
    options: TOP_LEVEL,
    validFor: /^\w*$/,
  };
}
