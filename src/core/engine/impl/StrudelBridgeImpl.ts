import { Hap } from "@core/types/hap";
import { StrudelBridge } from "../StrudelBridge";
const { initAudioOnFirstClick, getAudioContext, registerSynthSounds, webaudioOutput } = await import('@strudel/webaudio');
const { repl } = await import('@strudel/core');
const { mini } = await import('@strudel/mini');

export class StrudelBridgeImpl implements StrudelBridge {
    initialized: boolean = false;
    audioContext: AudioContext | null;
    replInstance : any | null;
    
    constructor() {
        this.initialized = false;
        this.audioContext = null;
        this.replInstance = null;
    }
    
    
    async init(): Promise<void> {
        if (this.initialized && this.audioContext != null  && this.replInstance != null) return;
        const initOnGesture = async (): Promise<void> => {
        try {
            await initAudioOnFirstClick();
            this.audioContext = getAudioContext();
            await registerSynthSounds();
            this.replInstance = repl({
                defaultOutput: webaudioOutput,
                getTime: () => this.audioContext!.currentTime,
            });

            this.initialized = true;
            console.log('[StrudelBridge] Audio initialized, REPL ready');
        } catch(err) {
            console.error('[StrudelBridge] Error init:', err);
        }
    
        document.removeEventListener('click', initOnGesture);
        document.removeEventListener('keydown', initOnGesture);
    };
 
        document.addEventListener('click', initOnGesture);
        document.addEventListener('keydown', initOnGesture);
    }

    async evaluate(code: string): Promise<void> {
        const pattern = mini(code).note().s("sawtooth");
        await this.replInstance.scheduler.setPattern(pattern);
        this.replInstance.scheduler.start();
        setTimeout(() => this.replInstance.scheduler.stop(), 4000);
    }
    
    queryArc(begin: number, end: number): Hap[] {
        throw new Error("Method not implemented.");
    }
    
    dispose(): void {
        throw new Error("Method not implemented.");
    }
    
}