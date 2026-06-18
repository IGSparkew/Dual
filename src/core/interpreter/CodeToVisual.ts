import type { Hap } from '../types/hap';

export interface CodeToVisual {
  parse(code: string): Promise<Hap[]>;
}
