import type { Hap } from "@core/types/hap";
import type { StrudelBridge } from "../StrudelBridge";

// Imports top-level — chargés une seule fois
const { initAudioOnFirstClick, getAudioContext, registerSynthSounds, webaudioOutput, samples } =
  await import('@strudel/webaudio');
const { repl, evalScope, evaluate: strudelEvaluate } = await import('@strudel/core');
const miniModule = await import('@strudel/mini');
const core = await import('@strudel/core');
const webaudio = await import('@strudel/webaudio');

let scopeReady = false;

export class StrudelBridgeImpl implements StrudelBridge {
  private audioContext: AudioContext | null = null;
  private replInstance: any = null;
  private currentPattern: any = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  getScheduler() {
    return this.replInstance?.scheduler ?? null;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise<void>((resolve) => {
      const initOnGesture = async () => {
        try {
          await initAudioOnFirstClick();
          this.audioContext = getAudioContext();
          await registerSynthSounds();

            await samples('github:tidalcycles/sounds-dirty');


        console.log('has samples:', typeof webaudio.samples);

          this.replInstance = repl({
            defaultOutput: webaudioOutput,
            getTime: () => this.audioContext!.currentTime,
          });

          this.initialized = true;
          console.log('[StrudelBridge] Audio initialized, REPL ready');
        } catch (err) {
          console.error('[StrudelBridge] Init error:', err);
        }

        document.removeEventListener('click', initOnGesture);
        document.removeEventListener('keydown', initOnGesture);
        resolve();
      };

      document.addEventListener('click', initOnGesture);
      document.addEventListener('keydown', initOnGesture);
    });

    return this.initPromise;
  }

  async evaluate(code: string): Promise<any> {
    if (!this.initialized) {
      await this.init();
    }

    if (!scopeReady) {
      await evalScope(core, miniModule);
      scopeReady = true;
    }

    const transpiled = code.replace(
      /"([^"]*(?:\[[^\]]*\])*[^"]*)"/g,
      'mini("$1")'
    );

    const result = await strudelEvaluate(transpiled);
    this.currentPattern = result?.pattern ?? result;

    if (this.replInstance && this.currentPattern?.queryArc) {
      this.replInstance.scheduler.setPattern(this.currentPattern);
    }

    return this.currentPattern;
  }

  queryArc(begin: number, end: number): Hap[] {
    if (!this.currentPattern) return [];
    return this.currentPattern.queryArc(begin, end);
  }

  dispose(): void {
    if (this.replInstance) {
      this.replInstance.scheduler.stop();
      this.replInstance = null;
    }

    this.audioContext = null;
    this.currentPattern = null;
    this.initialized = false;
    this.initPromise = null;
  }
}