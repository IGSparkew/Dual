import type { NormalizedHap } from '../types/hap';

export interface HapExtractor {
  extract(pattern: any, begin: number, end: number): NormalizedHap[];
}
