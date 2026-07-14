import type { Hap } from '../types/hap';

export interface StrudelBridge {
  init(): Promise<void>;
  evaluate(code: string): Promise<void>;
  queryArc(begin: number, end: number): Hap[];
  dispose(): void;
  getScheduler() : any;
  // Strudel Pattern instance — @strudel/core ships no type declarations, so the
  // whole bridge already treats patterns/repl as `any` (see StrudelBridgeImpl).
  getCurrentPattern(): any;
  // Re-fetch the live AudioContext after an offline render replaced/closed it.
  refreshAudioContext(): void;
}
