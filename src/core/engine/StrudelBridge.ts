import type { Hap } from '../types/hap';

export interface StrudelBridge {
  init(): Promise<void>;
  evaluate(code: string): Promise<void>;
  queryArc(begin: number, end: number): Hap[];
  dispose(): void;
  getScheduler() : any;
}
