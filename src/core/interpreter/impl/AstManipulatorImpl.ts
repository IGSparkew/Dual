import { parse as acornParse } from 'acorn';
import { generate } from 'escodegen';

import type { AstManipulator, AstNode, AstVisitor } from '../AstManipulator';

export class AstManipulatorImpl implements AstManipulator {
  parse(code: string): AstNode {
    return acornParse(code, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      locations: false,
    }) as AstNode;
  }

  generate(ast: AstNode): string {
    return generate(ast, {
      format: { indent: { style: '  ' }, quotes: 'double' },
    });
  }

  walk(ast: AstNode, visitor: AstVisitor): AstNode {
    return this._walkNode(ast, null, visitor) ?? ast;
  }

  getChainedArg(ast: AstNode, methodName: string): unknown | null {
    let result: unknown | null = null;

    this.walk(ast, {
      CallExpression: (node) => {
        const call = node as AstCallExpression;
        if (
          call.callee.type === 'MemberExpression' &&
          (call.callee as AstMemberExpression).property.type === 'Identifier' &&
          ((call.callee as AstMemberExpression).property as AstIdentifier).name === methodName &&
          call.arguments.length > 0
        ) {
          const arg = call.arguments[0] as AstLiteral;
          if (arg.type === 'Literal') result = arg.value ?? null;
        }
      },
    });

    return result;
  }

  setChainedArg(ast: AstNode, methodName: string, value: string | number | boolean): AstNode {
    let found = false;

    const updated = this.walk(ast, {
      CallExpression: (node) => {
        const call = node as AstCallExpression;
        if (
          call.callee.type === 'MemberExpression' &&
          (call.callee as AstMemberExpression).property.type === 'Identifier' &&
          ((call.callee as AstMemberExpression).property as AstIdentifier).name === methodName
        ) {
          found = true;
          return {
            ...call,
            arguments: [this._makeLiteral(value)],
          } as AstNode;
        }
      },
    });

    if (found) return updated;

    // Method absent — wrap the root expression in a new chained call
    return this._appendChainedCall(updated, methodName, value);
  }

  removeChainedCall(ast: AstNode, methodName: string): AstNode {
    return this.walk(ast, {
      CallExpression: (node) => {
        const call = node as AstCallExpression;
        if (
          call.callee.type === 'MemberExpression' &&
          (call.callee as AstMemberExpression).property.type === 'Identifier' &&
          ((call.callee as AstMemberExpression).property as AstIdentifier).name === methodName
        ) {
          // Replace the whole call with its receiver (the object before the dot)
          return (call.callee as AstMemberExpression).object as AstNode;
        }
      },
    });
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private _walkNode(
    node: AstNode,
    parent: AstNode | null,
    visitor: AstVisitor,
  ): AstNode | null {
    if (!node || typeof node !== 'object') return node;

    // Depth-first: recurse into children first
    const transformed: Record<string, unknown> = { ...(node as unknown as Record<string, unknown>) };

    const nodeRecord = node as unknown as Record<string, unknown>;
    for (const key of Object.keys(nodeRecord)) {
      const child = nodeRecord[key];
      if (Array.isArray(child)) {
        const newArr: unknown[] = [];
        for (const item of child) {
          if (item && typeof item === 'object' && 'type' in item) {
            const result = this._walkNode(item as AstNode, node, visitor);
            if (result !== null) newArr.push(result);
          } else {
            newArr.push(item);
          }
        }
        transformed[key] = newArr;
      } else if (child && typeof child === 'object' && 'type' in child) {
        transformed[key] = this._walkNode(child as AstNode, node, visitor) ?? child;
      }
    }

    const current = transformed as unknown as AstNode;
    const fn = visitor[node.type];
    if (fn) {
      const result = fn(current, parent);
      if (result === null) return null;
      if (result !== undefined) return result;
    }

    return current;
  }

  private _makeLiteral(value: string | number | boolean): AstNode {
    return {
      type: 'Literal',
      value,
      raw: typeof value === 'string' ? `"${value}"` : String(value),
      start: 0,
      end: 0,
    } as AstNode;
  }

  private _appendChainedCall(ast: AstNode, methodName: string, value: string | number | boolean): AstNode {
    const program = ast as AstProgram;
    if (program.type !== 'Program' || program.body.length === 0) return ast;

    const stmt = program.body[0] as AstExpressionStatement;
    if (stmt.type !== 'ExpressionStatement') return ast;

    const newCall: AstNode = {
      type: 'CallExpression',
      callee: {
        type: 'MemberExpression',
        object: stmt.expression as AstNode,
        property: { type: 'Identifier', name: methodName, start: 0, end: 0 } as AstNode,
        computed: false,
        start: 0,
        end: 0,
      } as AstNode,
      arguments: [this._makeLiteral(value)],
      start: 0,
      end: 0,
    } as AstNode;

    return {
      ...program,
      body: [{ ...stmt, expression: newCall }],
    } as AstNode;
  }
}

// ─── Minimal local ESTree shapes (avoids @types/estree dependency) ──────────

interface AstProgram extends AstNode {
  body: AstNode[];
}
interface AstExpressionStatement extends AstNode {
  expression: AstNode;
}
interface AstCallExpression extends AstNode {
  callee: AstNode;
  arguments: AstNode[];
}
interface AstMemberExpression extends AstNode {
  object: AstNode;
  property: AstNode;
  computed: boolean;
}
interface AstIdentifier extends AstNode {
  name: string;
}
interface AstLiteral extends AstNode {
  value: unknown;
  raw?: string;
}

export const astManipulatorImpl: AstManipulator = new AstManipulatorImpl();
