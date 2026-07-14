import type { AudioExporter } from '../AudioExporter';
import { useStore } from '@core/state/store';
import { strudelBridge } from './StrudelBridgeImpl';
import { scheduler } from './SchedulerImpl';

// Top-level dynamic import mirrors StrudelBridgeImpl's convention for @strudel/*.
const { renderPatternAudio } = await import('@strudel/webaudio');

// CD-quality default; renderPatternAudio requires a concrete sampleRate to size
// the OfflineAudioContext buffer.
const SAMPLE_RATE = 44100;
// Passed through to superdough's initAudio. It must be a concrete number:
// setMaxPolyphony(undefined) resolves to NaN (parseInt(undefined) is NaN and the
// `?? DEFAULT` fallback only guards null/undefined), so we pass the default (128).
const MAX_POLYPHONY = 128;
const MULTI_CHANNEL_ORBITS = false;

// Strip characters that are invalid in filenames on common platforms.
function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim();
  return cleaned.length > 0 ? cleaned : 'export';
}

export class AudioExporterImpl implements AudioExporter {
  async exportWav(cycles: number, filenameHint: string): Promise<void> {
    const store = useStore.getState();

    const pattern = strudelBridge.getCurrentPattern();
    if (!pattern) {
      store.addNotification('Nothing to export: evaluate some code first', 'warning');
      return;
    }

    // Pause (not stop) so the transport position is preserved: exporting should
    // not rewind the user's playhead. This also frees the shared global audio
    // context from live playback before the offline render takes it over.
    scheduler.pause();

    // Strudel uses cps (cycles per second); 1 cycle = 4 beats (cps = bpm/60/4).
    const cps = store.transport.bpm / 60 / 4;
    const downloadName = sanitizeFilename(filenameHint);

    try {
      await renderPatternAudio(
        pattern,
        cps,
        0,
        cycles,
        SAMPLE_RATE,
        MAX_POLYPHONY,
        MULTI_CHANNEL_ORBITS,
        downloadName,
      );
      store.addNotification(`Exported "${downloadName}.wav"`, 'success');
    } catch (error) {
      store.addNotification(`Export failed: ${String(error)}`, 'error');
    } finally {
      // renderPatternAudio closes the live AudioContext and leaves the global
      // one null; without this, live playback stays silently broken. Runs even
      // when the render threw.
      strudelBridge.refreshAudioContext();
    }
  }
}

export const audioExporter: AudioExporter = new AudioExporterImpl();
