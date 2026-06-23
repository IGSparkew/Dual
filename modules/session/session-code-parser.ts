import { astManipulatorImpl } from '@core/interpreter/impl/AstManipulatorImpl';
import type { AstNode } from '@core/interpreter/AstManipulator';

interface ExprNode extends AstNode {
  expression?: AstNode;
  callee?: AstNode & { name?: string };
  arguments?: AstNode[];
  body?: AstNode[];
}

/** A track parsed from code = an ordered list of clip source codes. */
export type ParsedTrack = string[];

function isStackCall(node: AstNode | undefined): node is ExprNode {
  const n = node as ExprNode | undefined;
  return (
    !!n &&
    n.type === 'CallExpression' &&
    n.callee?.type === 'Identifier' &&
    n.callee.name === 'stack' &&
    Array.isArray(n.arguments)
  );
}

/**
 * Parse Strudel code into tracks of clip codes.
 *
 * Convention (nested stacks):
 * - top-level non-stack `s("bd")`            → 1 track, 1 clip
 * - `stack(a, b)` (no nested stack)          → 1 track, clips [a, b]
 * - `stack(stack(a), stack(b))`              → 2 tracks, 1 clip each
 * - `stack(stack(a, b), c)`                  → 2 tracks: [a, b] and [c]
 *
 * Rule: if any top-level stack argument is itself a `stack(...)`, the
 * top-level arguments are treated as tracks; otherwise as clips of one track.
 *
 * Returns `null` when the code cannot be parsed (incomplete/invalid) so callers
 * keep the current visual state; `[]` for empty code.
 */
export function parseCodeToTracks(code: string): ParsedTrack[] | null {
  if (!code.trim()) return [];

  let ast: ExprNode;
  try {
    ast = astManipulatorImpl.parse(code) as ExprNode;
  } catch {
    return null;
  }

  const stmt = ast.body?.[0] as ExprNode | undefined;
  if (!stmt || stmt.type !== 'ExpressionStatement' || !stmt.expression) {
    return null;
  }

  const expr = stmt.expression as ExprNode;

  if (!isStackCall(expr)) {
    // Single bare expression → one track, one clip
    return [[generateExpr(expr)]];
  }

  const args = expr.arguments as AstNode[];
  const hasNestedStack = args.some(isStackCall);

  if (!hasNestedStack) {
    // Flat stack → a single track whose clips are the arguments
    return [args.map(generateExpr)];
  }

  // Nested stacks → each top-level argument is a track
  return args.map(arg =>
    isStackCall(arg)
      ? (arg.arguments as AstNode[]).map(generateExpr)
      : [generateExpr(arg)]
  );
}

function generateExpr(node: AstNode): string {
  return astManipulatorImpl.generate(node).trim().replace(/;$/, '');
}
