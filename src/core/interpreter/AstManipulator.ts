import type { Node } from 'acorn';

export type AstNode = Node;

/**
 * Visitor map: key = ESTree node type, value = transform function.
 * Return a new node to replace, null to remove, void/undefined to keep as-is.
 */
export type AstVisitor = Partial<Record<string, (node: AstNode, parent: AstNode | null) => AstNode | null | void>>;

export interface AstManipulator {
  /** Parse Strudel/JS code into an ESTree AST. Throws on syntax error. */
  parse(code: string): AstNode;

  /** Regenerate source code from an ESTree AST. */
  generate(ast: AstNode): string;

  /**
   * Walk the AST depth-first and apply visitor transforms.
   * Returns a new (or the same) AST node.
   */
  walk(ast: AstNode, visitor: AstVisitor): AstNode;

  /**
   * Read the first argument of a chained method call.
   * e.g. getChainedArg(ast, 'gain') on `note("c3").gain(0.5)` → 0.5
   * Returns null if the method is absent.
   */
  getChainedArg(ast: AstNode, methodName: string): unknown | null;

  /**
   * Set (or add) a chained method call with a single literal argument.
   * If the method already exists its argument is updated in place.
   * e.g. setChainedArg(ast, 'gain', 0.8) → `…expr….gain(0.8)`
   */
  setChainedArg(ast: AstNode, methodName: string, value: string | number | boolean): AstNode;

  /**
   * Remove a chained method call entirely.
   * e.g. removeChainedCall(ast, 'room') on `note("c3").gain(0.5).room(0.3)`
   *      → `note("c3").gain(0.5)`
   */
  removeChainedCall(ast: AstNode, methodName: string): AstNode;
}
