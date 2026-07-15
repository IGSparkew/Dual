import type { RenderPatternOffline } from '../RenderPatternOffline';

// Vendored offline renderer replacing @strudel/webaudio's renderPatternAudio.
//
// Why this exists: the published dist of @strudel/webaudio inlines a private
// copy of superdough's output module (Orbit/controller classes) together with
// private copies of its helpers and of the module-level `audioContext` state,
// while `superdough()` / `setAudioContext()` resolve to the separate
// `superdough` bundle. renderPatternAudio therefore switches only ONE of the
// two copies to the offline context: on the first hap using .room()/.delay(),
// the inlined copy lazily creates a fresh AudioContext and connects an
// offline node into it → InvalidAccessError ("different audio context") and
// every hap of the reverb-carrying clip is dropped from the render.
//
// This file fixes that by living in a single module universe: EVERY runtime
// import below comes from the `superdough` package specifier. Do NOT replace
// any of them with '@strudel/webaudio' or a deep import ('superdough/*.mjs')
// — that would recreate the module duplication this file works around.
//
// It also fixes duck (sidechain) for offline rendering: Orbit.duck defers its
// gain ramps through webAudioTimeout (onended callbacks), but an
// OfflineAudioContext renders faster than the event loop, so the callbacks
// fire too late (no duck) and stragglers contaminate global state after the
// context swap. Instead, duck* controls are extracted from the hap values and
// the ramps are scheduled at absolute times after the hap loop, before
// startRendering() — which also guarantees every target orbit that played a
// hap already exists (no "duck target orbit N does not exist").

// Top-level dynamic import mirrors StrudelBridgeImpl's convention.
const {
  superdough,
  getAudioContext,
  setAudioContext,
  initAudio,
  getSuperdoughAudioController,
  setSuperdoughAudioController,
  resetGlobalEffects,
  errorLogger,
} = await import('superdough');

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// One ducking hap: duck* controls extracted from its value, onset time in
// offline-context seconds. Arrays mirror controller.duck's [x].flat() handling
// of scalar-or-array controls.
interface DuckEvent {
  t: number;
  orbits: (number | string)[];
  onsets: number[];
  attacks: number[];
  depths: number[];
}

// Reproduces Orbit.duck's curve (floor clamp(1 - sqrt(depth), 0.01, 1), attack
// min 0.002) directly on each target orbit's output gain at absolute times.
// Events must arrive sorted by ascending t (guaranteed by the sorted hap
// loop). Outside an overlap the curve is anchored at 1 so the exponential
// ramps have a defined start value; overlapping ducks compose piecewise — an
// accepted approximation of live cancel-and-hold behaviour.
function scheduleOfflineDucks(controller: any, duckEvents: DuckEvent[]): void {
  const lastEndByOrbit = new Map<number | string, number>();
  for (const event of duckEvents) {
    event.orbits.forEach((target, idx) => {
      const orbit = controller.nodes[target];
      if (orbit == null) {
        // Target orbit never played a hap in this render: nothing to duck.
        return;
      }
      const onset = event.onsets[idx] ?? event.onsets[0] ?? 0;
      const attack = Math.max(event.attacks[idx] ?? event.attacks[0] ?? 0.1, 0.002);
      const depth = event.depths[idx] ?? event.depths[0] ?? 1;

      const gainParam = orbit.output.gain;
      const t0 = Math.max(event.t, 0);
      const duckedVal = clamp(1 - Math.sqrt(depth), 0.01, 1);
      const lastEnd = lastEndByOrbit.get(target) ?? -Infinity;
      if (t0 >= lastEnd) {
        gainParam.setValueAtTime(1, t0);
      }
      gainParam.exponentialRampToValueAtTime(duckedVal, t0 + onset);
      gainParam.exponentialRampToValueAtTime(1, t0 + onset + attack);
      lastEndByOrbit.set(target, Math.max(lastEnd, t0 + onset + attack));
    });
  }
}

export class RenderPatternOfflineImpl implements RenderPatternOffline {
  async render(
    pattern: any,
    cps: number,
    begin: number,
    end: number,
    sampleRate: number,
    maxPolyphony: number,
    multiChannelOrbits: boolean,
  ): Promise<AudioBuffer> {
    // Free the hardware and make sure nothing live keeps scheduling while the
    // shared module-level context points at the offline one.
    await getAudioContext().close();

    const offlineContext = new OfflineAudioContext(2, ((end - begin) / cps) * sampleRate, sampleRate);

    try {
      setAudioContext(offlineContext);
      // Drop the live controller so the lazy getter rebuilds one on the offline
      // context, with the Orbit class from this same module universe.
      setSuperdoughAudioController(null);
      const controller = getSuperdoughAudioController();
      await initAudio({ maxPolyphony, multiChannelOrbits });

      // Calling superdough(...) in ascending onset order is required for
      // controls that depend on audio graph state (like `cut`) and guarantees
      // duckEvents ends up sorted for scheduleOfflineDucks.
      const haps = pattern
        .queryArc(begin, end, { _cps: cps })
        .sort((a: any, b: any) => a.whole.begin.valueOf() - b.whole.begin.valueOf());

      const duckEvents: DuckEvent[] = [];
      for (const hap of haps) {
        if (!hap.hasOnset()) continue;
        hap.ensureObjectValue();
        // Clone before stripping duck* controls so the pattern's own values are
        // never mutated (they are reused by live playback after the export).
        const value = { ...hap.value };
        const t = (hap.whole.begin.valueOf() - begin) / cps;
        if (value.duckorbit != null) {
          duckEvents.push({
            t,
            orbits: [value.duckorbit].flat(),
            onsets: [value.duckonset ?? 0].flat(),
            attacks: [value.duckattack ?? 0.1].flat(),
            depths: [value.duckdepth ?? 1].flat(),
          });
        }
        delete value.duckorbit;
        delete value.duckonset;
        delete value.duckattack;
        delete value.duckdepth;
        try {
          await superdough(value, t, hap.duration / cps, cps, t);
        } catch (err) {
          errorLogger(err, 'render-pattern-offline');
        }
      }

      scheduleOfflineDucks(controller, duckEvents);

      return await offlineContext.startRendering();
    } finally {
      setAudioContext(null);
      setSuperdoughAudioController(null);
      resetGlobalEffects();
    }
  }

  // 16-bit PCM WAV encoder (interleaved, little-endian, 44-byte RIFF header).
  toWavBlob(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = buffer.length * blockAlign;
    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);

    const writeAscii = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };

    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 8 * bytesPerSample, true);
    writeAscii(36, 'data');
    view.setUint32(40, dataSize, true);

    const channels: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) channels.push(buffer.getChannelData(ch));
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = clamp(channels[ch][i], -1, 1);
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += bytesPerSample;
      }
    }
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }
}

export const renderPatternOffline: RenderPatternOffline = new RenderPatternOfflineImpl();
