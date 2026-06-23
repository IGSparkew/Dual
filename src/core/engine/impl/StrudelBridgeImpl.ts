import type { Hap } from "@core/types/hap";
import type { StrudelBridge } from "../StrudelBridge";
import { useStore } from "@core/state/store";

const { initAudioOnFirstClick, getAudioContext, registerSynthSounds, webaudioOutput, samples } =
  await import('@strudel/webaudio');
const { repl, evalScope } = await import('@strudel/core');
const { evaluate: strudelEvaluate } = await import('@strudel/transpiler');
const miniModule = await import('@strudel/mini');
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
        await samples('github:tidalcycles/dirt-samples');
        this.replInstance = repl({
          defaultOutput: webaudioOutput,
          getTime: () => this.audioContext!.currentTime,
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

    if (!scopeReady) {
      await evalScope(core, miniModule);
      scopeReady = true;
    }

    const result = await strudelEvaluate(code);
    this.currentPattern = result?.pattern ?? result;

    if (this.replInstance && this.currentPattern?.queryArc) {
      this.replInstance.scheduler.setPattern(this.currentPattern);
    }

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