/**
 * Tests for `AudioExporterImpl.exportWav` (offline WAV render / download).
 *
 * `AudioExporterImpl.ts` statically imports the `renderPatternOffline`
 * singleton (`RenderPatternOfflineImpl.ts`, which itself top-level
 * `await import`s `superdough`) and the `strudelBridge`/`scheduler`
 * singletons — which themselves top-level `await import('@strudel/core')`/
 * `import('@strudel/webaudio')`. All of these pull in the
 * `@strudel/core`/superdough barrels, which break under vitest/Node (see
 * `shareLink.test.ts`). So all three modules are fully mocked with
 * `vi.mock` (hoisted above the imports) — nothing here touches real Strudel
 * or superdough code; only `AudioExporterImpl`'s own orchestration (cps
 * math, pause-before-render, filename sanitizing on the download anchor,
 * notification wording, and the finally-always-refreshes contract) is under
 * test. Tests run in the node environment, so the download path's
 * `document`/`URL.createObjectURL` usage is stubbed minimally.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { render, toWavBlob, getCurrentPattern, refreshAudioContext, pause } = vi.hoisted(() => ({
  render: vi.fn(),
  toWavBlob: vi.fn(),
  getCurrentPattern: vi.fn(),
  refreshAudioContext: vi.fn(),
  pause: vi.fn(),
}));

vi.mock('@core/engine/impl/RenderPatternOfflineImpl', () => ({
  renderPatternOffline: { render, toWavBlob },
}));

vi.mock('@core/engine/impl/StrudelBridgeImpl', () => ({
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

vi.mock('@core/engine/impl/SchedulerImpl', () => ({
  scheduler: {
    play: vi.fn(),
    pause,
    stop: vi.fn(),
    setBpm: vi.fn(),
    getState: vi.fn(),
  },
}));

import { useStore } from '@core/state/store';
import { AudioExporterImpl } from '@core/engine/impl/AudioExporterImpl';

const FAKE_PATTERN = { queryArc: vi.fn() };
const FAKE_BUFFER = { length: 44100, numberOfChannels: 2, sampleRate: 44100 };
const FAKE_BLOB = { type: 'audio/wav' };

describe('AudioExporterImpl.exportWav', () => {
  let exporter: AudioExporterImpl;
  let anchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    exporter = new AudioExporterImpl();
    render.mockReset().mockResolvedValue(FAKE_BUFFER);
    toWavBlob.mockReset().mockReturnValue(FAKE_BLOB);
    getCurrentPattern.mockReset().mockReturnValue(FAKE_PATTERN);
    refreshAudioContext.mockReset();
    pause.mockReset();
    useStore.setState({ notifications: [], transport: { status: 'stopped', bpm: 120, position: 0 } });

    // Minimal DOM/URL stubs for the <a download> flow (node test environment).
    anchor = { href: '', download: '', click: vi.fn() };
    (globalThis as any).document = {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    };
    (URL as any).createObjectURL = vi.fn(() => 'blob:mock');
    (URL as any).revokeObjectURL = vi.fn();
  });

  it('computes cps as bpm/60/4 and forwards it (plus range/rate/polyphony/orbits) to renderPatternOffline.render', async () => {
    useStore.setState({ transport: { status: 'stopped', bpm: 140, position: 0 } });

    await exporter.exportWav(4, 'My Song');

    expect(render).toHaveBeenCalledTimes(1);
    const [pattern, cps, begin, cycles, sampleRate, maxPolyphony, multiChannelOrbits] = render.mock.calls[0];
    expect(pattern).toBe(FAKE_PATTERN);
    expect(cps).toBeCloseTo(140 / 60 / 4, 10);
    expect(begin).toBe(0);
    expect(cycles).toBe(4);
    expect(sampleRate).toBe(44100);
    expect(maxPolyphony).toBe(128);
    expect(multiChannelOrbits).toBe(false);
  });

  it('encodes the rendered buffer to WAV and triggers a download of it', async () => {
    await exporter.exportWav(4, 'My Song');

    expect(toWavBlob).toHaveBeenCalledWith(FAKE_BUFFER);
    expect(URL.createObjectURL).toHaveBeenCalledWith(FAKE_BLOB);
    expect(anchor.href).toBe('blob:mock');
    expect(anchor.download).toBe('My Song.wav');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('pauses the transport (not stop, preserving playhead position) before rendering', async () => {
    await exporter.exportWav(2, 'song');
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('sanitizes filesystem-invalid characters out of the filename hint', async () => {
    await exporter.exportWav(1, 'My:Song?<name>');
    expect(anchor.download).toBe('My_Song__name_.wav');
  });

  it('falls back to "export" for a filename hint that is empty/whitespace only', async () => {
    await exporter.exportWav(1, '   ');
    expect(anchor.download).toBe('export.wav');
  });

  it('warns and exits early without pausing or rendering when there is no evaluated pattern', async () => {
    getCurrentPattern.mockReturnValue(null);

    await exporter.exportWav(4, 'song');

    expect(pause).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    const notifications = useStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('warning');
  });

  it('refreshAudioContext runs in a finally — even when renderPatternOffline.render throws', async () => {
    render.mockRejectedValue(new Error('OfflineAudioContext render failed'));

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
