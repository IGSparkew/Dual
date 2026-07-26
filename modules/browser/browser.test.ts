/**
 * Unit tests for the browser's pure half: the sound map → tree derivation and
 * the import pipeline (type detection, naming, dough map generation).
 *
 * `browser.ts` touches neither React, IPC nor the store, so nothing is mocked
 * here — the module is exercised directly.
 */
import { describe, it, expect } from 'vitest';
import type { SoundInfo } from '@core/types/sound';
import {
  baseName,
  buildSampleMap,
  detectImportKind,
  deriveTree,
  displayBank,
  displayNameOf,
  instrumentKeyOf,
  isAudioFile,
  noteKeyOf,
  slugify,
  userPackName,
} from './browser';

function sample(name: string, kind: 'drum' | 'pitched' = 'drum', variants = 1): SoundInfo {
  return { name, type: 'sample', kind, variants };
}

/** A General MIDI program as registerSoundfonts() leaves it in the map. */
function font(name: string, variants = 1): SoundInfo {
  return { name, type: 'soundfont', kind: 'pitched', variants };
}

describe('deriveTree', () => {
  it('groups sounds sharing a prefix and leaves the rest loose', () => {
    const tree = deriveTree(
      [
        sample('rolandtr909_bd'),
        sample('rolandtr909_sd'),
        sample('bd', 'drum', 24),
        sample('piano', 'pitched', 88),
      ],
      'samples',
    );

    expect(tree.map((node) => node.bank)).toEqual(['rolandtr909', null]);
    expect(tree[0].sounds.map((s) => s.displayName)).toEqual(['bd', 'sd']);
    expect(tree[1].sounds.map((s) => s.name)).toEqual(['bd', 'piano']);
  });

  it('does not invent a bank from a lone underscored name', () => {
    // One member only: the `_` is part of the name, not a bank convention.
    const tree = deriveTree([sample('recorder_alto'), sample('bd')], 'samples');
    expect(tree.map((node) => node.bank)).toEqual([null]);
    expect(tree[0].sounds.map((s) => s.name)).toEqual(['recorder_alto', 'bd']);
  });

  it('splits the tabs on the user_ prefix and hides it from labels', () => {
    const infos = [sample('bd'), sample('user_kick'), sample('user_kit_bd'), sample('user_kit_sd')];

    const core = deriveTree(infos, 'samples');
    expect(core.flatMap((n) => n.sounds.map((s) => s.name))).toEqual(['bd']);

    const user = deriveTree(infos, 'userdata');
    expect(user.map((n) => n.bank)).toEqual(['user_kit', null]);
    expect(user[0].sounds.map((s) => s.displayName)).toEqual(['bd', 'sd']);
    expect(user[1].sounds.map((s) => s.displayName)).toEqual(['kick']);
    expect(user.flatMap((n) => n.sounds.map((s) => s.origin))).toEqual(['user', 'user', 'user']);
  });

  it('never groups a bare user sound under a `user` bank', () => {
    const tree = deriveTree([sample('user_kick'), sample('user_snare')], 'userdata');
    expect(tree.map((node) => node.bank)).toEqual([null]);
  });

  it('excludes synths from every tab — they have nothing to browse', () => {
    const infos: SoundInfo[] = [sample('bd'), { name: 'sine', type: 'synth', kind: 'drum', variants: 0 }];
    expect(deriveTree(infos, 'samples')[0].sounds.map((s) => s.name)).toEqual(['bd']);
    expect(deriveTree(infos, 'soundfonts')).toEqual([]);
    expect(deriveTree(infos, 'userdata')).toEqual([]);
  });

  it('puts soundfonts in their own tab, grouped by GM family', () => {
    const infos: SoundInfo[] = [
      sample('bd'),
      font('gm_electric_guitar_clean'),
      font('gm_electric_guitar_jazz'),
      font('gm_acoustic_grand_piano'),
    ];

    // A sample stays out of the soundfonts tab, and vice versa.
    expect(deriveTree(infos, 'samples').flatMap((n) => n.sounds.map((s) => s.name))).toEqual(['bd']);

    const fonts = deriveTree(infos, 'soundfonts');
    expect(fonts.map((n) => n.bank)).toEqual(['gm_electric_guitar', null]);
    // The `gm_` family marker is hidden, like `user_`.
    expect(fonts[0].sounds.map((s) => s.displayName)).toEqual(['clean', 'jazz']);
    expect(displayBank(fonts[0].bank!)).toBe('electric_guitar');
    expect(fonts[1].sounds.map((s) => s.displayName)).toEqual(['acoustic_grand_piano']);
    // Soundfonts are note-addressed — a drop must generate note(...).sound(...).
    expect(fonts[1].sounds[0].kind).toBe('pitched');
  });

  it('never groups a lone gm_ font under a `gm` bank', () => {
    const tree = deriveTree([font('gm_kalimba'), font('gm_ocarina')], 'soundfonts');
    expect(tree.map((node) => node.bank)).toEqual([null]);
    expect(tree[0].sounds.map((s) => s.displayName)).toEqual(['kalimba', 'ocarina']);
  });

  it('keeps a matched sound under its bank when filtering', () => {
    const tree = deriveTree(
      [sample('rolandtr909_bd'), sample('rolandtr909_sd'), sample('bd')],
      'samples',
      '909_sd',
    );
    expect(tree).toHaveLength(1);
    expect(tree[0].bank).toBe('rolandtr909');
    expect(tree[0].sounds.map((s) => s.name)).toEqual(['rolandtr909_sd']);
  });

  it('carries kind and variant count through', () => {
    const [node] = deriveTree([sample('piano', 'pitched', 88)], 'samples');
    expect(node.sounds[0]).toMatchObject({ kind: 'pitched', variants: 88, origin: 'core' });
  });
});

describe('displayNameOf / displayBank', () => {
  it('strips the bank prefix then the provenance marker', () => {
    expect(displayNameOf('user_kit_bd', 'user_kit')).toBe('bd');
    expect(displayNameOf('user_kick', null)).toBe('kick');
    expect(displayNameOf('rolandtr909_bd', 'rolandtr909')).toBe('bd');
    expect(displayBank('user_kit')).toBe('kit');
    expect(displayBank('rolandtr909')).toBe('rolandtr909');
  });
});

describe('isAudioFile / baseName / noteKeyOf', () => {
  it('accepts the audio extensions and rejects the rest', () => {
    expect(isAudioFile('kick.WAV')).toBe(true);
    expect(isAudioFile('pad.flac')).toBe(true);
    expect(isAudioFile('readme.txt')).toBe(false);
    expect(isAudioFile('cover.png')).toBe(false);
  });

  it('drops directories and extension', () => {
    expect(baseName('kit/sub/bd.wav')).toBe('bd');
    expect(baseName('C:\\kit\\sd.wav')).toBe('sd');
  });

  it('reads dough sharps, ASCII sharps and flats, ignoring velocity suffixes', () => {
    expect(noteKeyOf('A0v8.mp3')).toBe('A0');
    expect(noteKeyOf('Ds1v8.mp3')).toBe('Ds1');
    expect(noteKeyOf('D#1.wav')).toBe('D#1');
    expect(noteKeyOf('Eb1.wav')).toBe('Eb1');
    expect(noteKeyOf('kick.wav')).toBeNull();
    expect(noteKeyOf('hh2.wav')).toBeNull(); // `h` is not a note letter
  });
});

describe('detectImportKind', () => {
  it('calls a lone file a single sample, even a note-named one', () => {
    expect(detectImportKind(['kick.wav'])).toBe('single');
    expect(detectImportKind(['C4.wav'])).toBe('single');
  });

  it('calls a mostly note-named set a pitched instrument', () => {
    expect(detectImportKind(['A0.wav', 'C1.wav', 'Ds1.wav', 'readme_note.wav'])).toBe('pitched');
  });

  it('calls a multi-file non-note set a drum bank', () => {
    expect(detectImportKind(['bd.wav', 'sd.wav', 'hh.wav'])).toBe('drum-bank');
  });

  it('needs a strict majority of notes to call it pitched', () => {
    expect(detectImportKind(['A0.wav', 'bd.wav'])).toBe('drum-bank');
  });
});

describe('slugify / userPackName', () => {
  it('reduces to [a-z0-9_] without leading, trailing or duplicated separators', () => {
    expect(slugify('  My Kit (2024)! ')).toBe('my_kit_2024');
    expect(slugify('kick.wav')).toBe('kick');
    expect(slugify('---')).toBe('');
  });

  it('prefixes once, never twice', () => {
    expect(userPackName('kick')).toBe('user_kick');
    expect(userPackName('user_kick')).toBe('user_kick');
  });
});

describe('instrumentKeyOf', () => {
  it('folds numbered takes of one instrument together', () => {
    expect(instrumentKeyOf('bd.wav')).toBe('bd');
    expect(instrumentKeyOf('BD2.wav')).toBe('bd');
    expect(instrumentKeyOf('bd-3.wav')).toBe('bd');
    expect(instrumentKeyOf('bd_04.wav')).toBe('bd');
  });

  it('keeps an all-digit name rather than emptying it', () => {
    expect(instrumentKeyOf('808.wav')).toBe('808');
  });
});

describe('buildSampleMap', () => {
  it('maps a single sample to a one-entry list', () => {
    expect(buildSampleMap('single', 'user_kick', ['kick.wav'])).toEqual({
      user_kick: ['kick.wav'],
    });
  });

  it('maps a drum bank to <pack>_<instrument> lists, keeping every take', () => {
    expect(buildSampleMap('drum-bank', 'user_kit', ['bd.wav', 'bd2.wav', 'sd.wav'])).toEqual({
      user_kit_bd: ['bd.wav', 'bd2.wav'],
      user_kit_sd: ['sd.wav'],
    });
  });

  it('maps a pitched instrument to a note → file object, dough style', () => {
    expect(buildSampleMap('pitched', 'user_epiano', ['A0v8.wav', 'C1v8.wav'])).toEqual({
      user_epiano: { A0: 'A0v8.wav', C1: 'C1v8.wav' },
    });
  });

  it('keeps the first file claiming a note (the map holds one per note)', () => {
    expect(buildSampleMap('pitched', 'user_x', ['C4v1.wav', 'C4v8.wav'])).toEqual({
      user_x: { C4: 'C4v1.wav' },
    });
  });

  it('falls back to the base name for a non-note file in a pitched import', () => {
    expect(buildSampleMap('pitched', 'user_x', ['A0.wav', 'weird.wav'])).toEqual({
      user_x: { A0: 'A0.wav', weird: 'weird.wav' },
    });
  });

  it('flattens dropped directory paths — files are written beside the map', () => {
    expect(buildSampleMap('drum-bank', 'user_kit', ['kit/bd.wav'])).toEqual({
      user_kit_bd: ['bd.wav'],
    });
  });
});
