import type { AstNode } from '../AstManipulator';
import type { VisualToCode } from '../VisualToCode';
import { astManipulatorImpl } from './AstManipulatorImpl';

export class VisualToCodeImpl implements VisualToCode {
  setChained(code: string, method: string, value: string | number | boolean): string {
    const ast = astManipulatorImpl.parse(code);
    const updated = astManipulatorImpl.setChainedArg(ast, method, value);
    return astManipulatorImpl.generate(updated);
  }

  removeChained(code: string, method: string): string {
    const ast = astManipulatorImpl.parse(code);
    const updated = astManipulatorImpl.removeChainedCall(ast, method);
    return astManipulatorImpl.generate(updated);
  }

  mute(code: string): string {
    return this.setChained(code, 'gain', 0);
  }

  unmute(code: string): string {
    const ast = astManipulatorImpl.parse(code);
    const gain = astManipulatorImpl.getChainedArg(ast, 'gain');
    if (gain !== 0) return code;
    const updated = astManipulatorImpl.removeChainedCall(ast, 'gain');
    return astManipulatorImpl.generate(updated);
  }

  stack(codeA: string, codeB: string): string {
    const exprA = this._extractExpression(codeA);
    const exprB = this._extractExpression(codeB);
    return `stack(${exprA}, ${exprB})`;
  }

  applyTransform(code: string, transform: (ast: AstNode) => AstNode): string {
    const ast = astManipulatorImpl.parse(code);
    const updated = transform(ast);
    return astManipulatorImpl.generate(updated);
  }

  // Strip a trailing semicolon that escodegen may add when generating from a Program node
  private _extractExpression(code: string): string {
    return code.trim().replace(/;$/, '');
  }
}

export const visualToCode: VisualToCode = new VisualToCodeImpl();
