import type { NormalizedHap } from '@core/types/hap';
import { hapExtractor } from '@core/engine/impl/HapExtractorImpl';
import { strudelBridge } from '@core/engine/impl/StrudelBridgeImpl';
import type { CodeToVisual } from '../CodeToVisual';
import { astManipulatorImpl } from './AstManipulatorImpl';

export class CodeToVisualImpl implements CodeToVisual {
  async evaluate(code: string, begin = 0, end = 1): Promise<NormalizedHap[]> {
    if (!this.validate(code)) return [];

    try {
      const pattern = await strudelBridge.evaluate(code);
      if (!pattern) return [];
      return hapExtractor.extract(pattern, begin, end);
    } catch {
      return [];
    }
  }

  validate(code: string): boolean {
    try {
      astManipulatorImpl.parse(code);
      return true;
    } catch {
      return false;
    }
  }
}

export const codeToVisual: CodeToVisual = new CodeToVisualImpl();
