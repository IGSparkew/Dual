export interface VisualToCode {
  /** Set or update a chained numeric/string method — e.g. .gain(0.8), .room(0.5) */
  setChained(code: string, method: string, value: string | number | boolean): string;

  /** Remove a chained method entirely — e.g. remove .room() */
  removeChained(code: string, method: string): string;

  /** Mute a clip: replace with .gain(0) */
  mute(code: string): string;

  /** Unmute a clip: remove the .gain(0) if present */
  unmute(code: string): string;

  /** Wrap two code snippets in stack() */
  stack(codeA: string, codeB: string): string;

  /** Escape-hatch: apply a raw AST transform and regenerate */
  applyTransform(code: string, transform: (ast: import('./AstManipulator').AstNode) => import('./AstManipulator').AstNode): string;
}
