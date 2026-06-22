import type { NormalizedHap } from '../types/hap';

export interface CodeToVisual {
  /**
   * Evaluate Strudel code and return normalized haps for the given arc.
   * Returns an empty array on syntax or evaluation error.
   */
  evaluate(code: string, begin?: number, end?: number): Promise<NormalizedHap[]>;

  /** Returns true if the code can be parsed without errors. */
  validate(code: string): boolean;
}
