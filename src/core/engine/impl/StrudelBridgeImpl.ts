import type { Hap } from "@core/types/hap";
import type { StrudelBridge } from "../StrudelBridge";
import { useStore } from "@core/state/store";

const { initAudioOnFirstClick, getAudioContext, registerSynthSounds, webaudioOutput } =
  await import('@strudel/webaudio');
const { repl, evalScope } = await import('@strudel/core');
const { transpiler } = await import('@strudel/transpiler');
// General-MIDI `gm_*` sounds (piano, guitars, synths…). registerSoundfonts adds
// them to the sound browser; the actual font data is fetched lazily on first play.
const { registerSoundfonts, setSoundfontUrl } = await import('@strudel/soundfonts');
const miniModule = await import('@strudel/mini');
const tonalModule = await import('@strudel/tonal'); // .scale(), chords, note helpers
const core = await import('@strudel/core');

let scopeReady = false;

export class StrudelBridgeImpl implements StrudelBridge {
  private audioContext: AudioContext | null;
  private replInstance: any;
  private currentPattern: any;
  private initialized: boolean;

  constructor() {
    this.audioContext = null;
    this.replInstance = null;
    this.currentPattern = null;
    this.initialized = false;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    
    const handler = async () => {
      document.removeEventListener('click', handler);
      document.removeEventListener('keydown', handler);
      useStore.getState().setEngineStatus('loading');
      try {
        await initAudioOnFirstClick();
        this.audioContext = getAudioContext();
        await registerSynthSounds();
        // Default samples are registered locally by sampleLoader.loadDefaults()
        // (see App.tsx) — no network fetch from github here.

        // Soundfonts (gm_*): point at the vendored local folder so playback stays
        // fully offline (run `npm run vendor:soundfonts` to populate it). Base URL
        // mirrors SampleLoaderImpl: dual:// under Electron, BASE_URL in the browser.
        // fontloader fetches `${base}/${name}.js`, so no trailing slash here.
        const soundfontBase = window.dualDesktop
          ? 'dual://core/samples/soundfonts'
          : `${import.meta.env.BASE_URL}samples/soundfonts`;
        setSoundfontUrl(soundfontBase);
        registerSoundfonts();
        this.replInstance = repl({
          defaultOutput: webaudioOutput,
          getTime: () => this.audioContext!.currentTime,
          // The transpiler converts Strudel sugar (mini-notation, `$:` →
          // `.p('$')`) before evaluation; without it `$:` lines are dead.
          transpiler,
        });

        if (this.audioContext?.state !== 'running') {
          await new Promise<void>((resolve) => {
            this.audioContext!.onstatechange = () => {
              if (this.audioContext!.state === 'running') resolve();
            };
          })
        }
        this.initialized = true;
        useStore.getState().setEngineStatus('ready');
        console.log('[StrudelBridge] Audio initialized, REPL ready');
      } catch (err) {
        console.error('[StrudelBridge] Init error:', err);
      }
    }


    document.addEventListener('click', handler);
    document.addEventListener('keydown', handler);
  }

  async evaluate(code: string): Promise<any> {
    if (!code.trim()) return null;

    if (!this.initialized) {
      await this.init();
    }
    if (!this.replInstance) return null;

    if (!scopeReady) {
      await evalScope(core, miniModule, tonalModule);
      scopeReady = true;
    }

    // repl.evaluate runs the full Strudel pipeline: it registers `.p`/`setcpm`
    // into the eval scope, transpiles, stacks the `$:` named outputs and pushes
    // the pattern to the scheduler. Pass `autostart = false` so re-evaluating on
    // code edits updates the pattern without forcing playback — the transport
    // controls play/pause explicitly.
    this.currentPattern = (await this.replInstance.evaluate(code, false)) ?? null;
    return this.currentPattern;
  }

  queryArc(begin: number, end: number): Hap[] {
    if (!this.currentPattern) return [];
    const haps = this.currentPattern.queryArc(begin, end);
    console.log("query arc: \n");
    console.log(JSON.stringify(haps, (_, v) => typeof v === 'bigint' ? Number(v) : v, 2))
    return haps;
  }

  getScheduler() {
    return this.replInstance?.scheduler ?? null;
  }

  getCurrentPattern() {
    return this.currentPattern;
  }

  refreshAudioContext(): void {
    // `renderPatternAudio` closes the global AudioContext before swapping in an
    // OfflineAudioContext, then resets it to null when done. Our repl captured
    // `getTime: () => this.audioContext.currentTime` against the context stored
    // here, so after an export that reference points at a closed context and
    // live playback silently breaks. Re-read the current live context to heal it.
    this.audioContext = getAudioContext();
  }

  dispose(): void {
    if (this.replInstance) {
      this.replInstance.scheduler.stop();
      this.replInstance = null;
    }

    this.audioContext = null;
    this.currentPattern = null;
    this.initialized = false;
  }
}

export const strudelBridge = new StrudelBridgeImpl();