import type { Hap } from '../types/hap';

export interface HapExtractor {
  extract(pattern: unknown, begin: number, end: number): Hap[];
}
