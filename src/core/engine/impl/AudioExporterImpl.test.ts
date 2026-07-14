/**
 * Tests for `AudioExporterImpl.exportWav` (offline WAV render / download).
 *
 * `AudioExporterImpl.ts` has a top-level `await import('@strudel/webaudio')`
 * (mirroring `StrudelBridgeImpl`'s convention), and statically imports the
 * `strudelBridge`/`scheduler` singletons — both of which themselves top-level
 * `await import('@strudel/core')`/`import('@strudel/webaudio')`. All three
 * pull in the `@strudel/core` barrel, which breaks under vitest/Node (see
 * `shareLink.test.ts`). So all three modules are fully mocked with
 * `vi.mock` (hoisted above the imports) — nothing here touches real Strudel
 * or superdough code; only `AudioExporterImpl`'s own orchestration
 * (cps math, pause-before-render, notification wording, and the
 * finally-always-refreshes contract) is under test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { renderPatternAudio, getCurrentPattern, refreshAudioContext, pause } = vi.hoisted(() => ({
  renderPatternAudio: vi.fn(),
  getCurrentPattern: vi.fn(),
  refreshAudioContext: vi.fn(),
  pause: vi.fn(),
}));

vi.mock('@strudel/webaudio', () => ({ renderPatternAudio }));

vi.mock('./StrudelBridgeImpl', () => ({
  strudelBridge: {
    init: vi.fn(),
    evaluate: vi.fn(),
    queryArc: vi.fn(),
    dispose: vi.fn(),
    getScheduler: vi.fn(),
    getCurrentPattern,
    refreshAudioContext,
  },
}));

vi.mock('./SchedulerImpl', () => ({
  scheduler: {
    play: vi.fn(),
    pause,
    stop: vi.fn(),
    setBpm: vi.fn(),
    getState: vi.fn(),
  },
}));

import { useStore } from '@core/state/store';
import { AudioExporterImpl } from './AudioExporterImpl';

const FAKE_PATTERN = { queryArc: vi.fn() };

describe('AudioExporterImpl.exportWav', () => {
  let exporter: AudioExporterImpl;

  beforeEach(() => {
    exporter = new AudioExporterImpl();
    renderPatternAudio.mockReset().mockResolvedValue(undefined);
    getCurrentPattern.mockReset().mockReturnValue(FAKE_PATTERN);
    refreshAudioContext.mockReset();
    pause.mockReset();
    useStore.setState({ notifications: [], transport: { status: 'stopped', bpm: 120, position: 0 } });
  });

  it('computes cps as bpm/60/4 and forwards it (plus range/rate/polyphony/orbits) to renderPatternAudio', async () => {
    useStore.setState({ transport: { status: 'stopped', bpm: 140, position: 0 } });

    await exporter.exportWav(4, 'My Song');

    expect(renderPatternAudio).toHaveBeenCalledTimes(1);
    const [pattern, cps, begin, cycles, sampleRate, maxPolyphony, multiChannelOrbits, name] =
      renderPatternAudio.mock.calls[0];
    expect(pattern).toBe(FAKE_PATTERN);
    expect(cps).toBeCloseTo(140 / 60 / 4, 10);
    expect(begin).toBe(0);
    expect(cycles).toBe(4);
    expect(sampleRate).toBe(44100);
    expect(maxPolyphony).toBe(128);
    expect(multiChannelOrbits).toBe(false);
    expect(name).toBe('My Song');
  });

  it('pauses the transport (not stop, preserving playhead position) before rendering', async () => {
    await exporter.exportWav(2, 'song');
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('sanitizes filesystem-invalid characters out of the filename hint', async () => {
    await exporter.exportWav(1, 'My:Song?<name>');
    const name = renderPatternAudio.mock.calls[0][7];
    expect(name).toBe('My_Song__name_');
  });

  it('falls back to "export" for a filename hint that is empty/whitespace only', async () => {
    await exporter.exportWav(1, '   ');
    const name = renderPatternAudio.mock.calls[0][7];
    expect(name).toBe('export');
  });

  it('warns and exits early without pausing or rendering when there is no evaluated pattern', async () => {
    getCurrentPattern.mockReturnValue(null);

    await exporter.exportWav(4, 'song');

    expect(pause).not.toHaveBeenCalled();
    expect(renderPatternAudio).not.toHaveBeenCalled();
    const notifications = useStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('warning');
  });

  it('refreshAudioContext runs in a finally — even when renderPatternAudio throws', async () => {
    renderPatternAudio.mockRejectedValue(new Error('OfflineAudioContext render failed'));

    await expect(exporter.exportWav(4, 'song')).resolves.toBeUndefined();

    expect(refreshAudioContext).toHaveBeenCalledTimes(1);
    const notifications = useStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('error');
    expect(notifications[0].message).toMatch(/OfflineAudioContext render failed/);
  });

  it('also refreshes the audio context on the success path', async () => {
    await exporter.exportWav(4, 'song');
    expect(refreshAudioContext).toHaveBeenCalledTimes(1);
    const notifications = useStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('success');
    expect(notifications[0].message).toBe('Exported "song.wav"');
  });

  it('never calls refreshAudioContext when exiting early on the no-pattern branch', async () => {
    getCurrentPattern.mockReturnValue(undefined);
    await exporter.exportWav(4, 'song');
    expect(refreshAudioContext).not.toHaveBeenCalled();
  });
});
