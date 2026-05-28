import type { Hap } from '../types/hap';

export interface StrudelBridge {
  evaluate(code: string): Promise<void>;
  queryArc(begin: number, end: number): Hap[];
  dispose(): void;
}
