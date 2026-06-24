import type {
  CodeRegion,
  CodeQuery,
  ClipDef,
  OutputRegion,
  GraphError,
} from '../CodeRegion';
import { astManipulatorImpl } from './AstManipulatorImpl';
import type { AstNode } from '../AstManipulator';

// ─── Minimal local ESTree shapes (avoids @types/estree dependency) ──────────

interface Node extends AstNode {
  start: number;
  end: number;
}
interface Program extends Node {
  body: Node[];
}
interface VariableDeclaration extends Node {
  kind: 'var' | 'let' | 'const';
  declarations: VariableDeclarator[];
}
interface VariableDeclarator extends Node {
  id: Node & { name?: string };
  init: Node | null;
}
interface ExpressionStatement extends Node {
  expression: Node;
}
interface LabeledStatement extends Node {
  label: Node & { name?: string };
  body: Node;
}
interface CallExpression extends Node {
  callee: Node;
  arguments: Node[];
}
interface MemberExpression extends Node {
  object: Node;
  property: Node & { name?: string };
  computed: boolean;
}
interface Identifier extends Node {
  name: string;
}

/** The label used for live output lines (`$: drums`). */
const DOLLAR_LABEL = '$';

/**
 * A query node backed by the exact source string it was sliced from. Holding
 * the backing string is what lets `source()` slice instead of re-generate.
 */
class CodeQueryImpl implements CodeQuery {
  constructor(
    private readonly node: Node,
    private readonly base: string,
  ) {}

  get start(): number {
    return this.node.start;
  }

  get end(): number {
    return this.node.end;
  }

  isCall(name?: string): boolean {
    if (this.node.type !== 'CallExpression') return false;
    if (name === undefined) return true;
    return calleeName(this.node as CallExpression) === name;
  }

  isIdentifier(): boolean {
    return this.node.type === 'Identifier';
  }

  identifierName(): string | null {
    return this.node.type === 'Identifier'
      ? (this.node as Identifier).name
      : null;
  }

  args(): CodeQuery[] {
    if (this.node.type !== 'CallExpression') return [];
    return (this.node as CallExpression).arguments.map(
      (arg) => new CodeQueryImpl(arg, this.base),
    );
  }

  source(): string {
    return this.base.slice(this.node.start, this.node.end);
  }
}

export class CodeRegionImpl implements CodeRegion {
  readClips(code: string): ClipDef[] | null {
    let ast: Program;
    try {
      ast = astManipulatorImpl.parse(code) as Program;
    } catch {
      return null;
    }

    const clips: ClipDef[] = [];
    for (const stmt of ast.body) {
      if (stmt.type !== 'VariableDeclaration') continue;
      const decl = stmt as VariableDeclaration;
      if (decl.kind !== 'const') continue;

      for (const d of decl.declarations) {
        if (d.id.type !== 'Identifier' || !d.id.name || !d.init) continue;
        clips.push({
          name: d.id.name,
          source: code.slice(d.init.start, d.init.end),
          refs: stackRefs(d.init),
          // Span the whole declaration so a delete removes `const … ;` cleanly.
          start: decl.start,
          end: decl.end,
        });
      }
    }
    return clips;
  }

  readExpr(source: string): CodeQuery | null {
    let ast: Program;
    try {
      ast = astManipulatorImpl.parse(source) as Program;
    } catch {
      return null;
    }
    const stmt = ast.body[0] as ExpressionStatement | undefined;
    if (!stmt || stmt.type !== 'ExpressionStatement' || !stmt.expression) {
      return null;
    }
    return new CodeQueryImpl(stmt.expression, source);
  }

  locateOutput(code: string): OutputRegion {
    let ast: Program;
    try {
      ast = astManipulatorImpl.parse(code) as Program;
    } catch {
      return { kind: 'none', start: code.length, end: code.length };
    }

    // Prefer an `arrange(...)` statement if one exists.
    for (const stmt of ast.body) {
      if (stmt.type !== 'ExpressionStatement') continue;
      const expr = (stmt as ExpressionStatement).expression;
      if (expr.type === 'CallExpression' && calleeName(expr as CallExpression) === 'arrange') {
        return { kind: 'arrange', start: stmt.start, end: stmt.end };
      }
    }

    // Otherwise span the contiguous block of `$:` labeled statements.
    const dollars = ast.body.filter(
      (s): s is LabeledStatement =>
        s.type === 'LabeledStatement' &&
        (s as LabeledStatement).label.name === DOLLAR_LABEL,
    );
    if (dollars.length > 0) {
      return {
        kind: 'dollar',
        start: dollars[0].start,
        end: dollars[dollars.length - 1].end,
      };
    }

    return { kind: 'none', start: code.length, end: code.length };
  }

  spliceSpan(code: string, start: number, end: number, replacement: string): string {
    return code.slice(0, start) + replacement + code.slice(end);
  }

  validateGraph(clips: ClipDef[]): GraphError[] {
    const errors: GraphError[] = [];

    // Index by name; flag duplicates.
    const indexByName = new Map<string, number>();
    clips.forEach((clip, i) => {
      if (indexByName.has(name(clip))) {
        errors.push({
          kind: 'duplicate',
          name: clip.name,
          message: `« ${clip.name} » est déclaré plusieurs fois.`,
        });
      } else {
        indexByName.set(clip.name, i);
      }
    });

    // Dead refs + declaration order.
    clips.forEach((clip, i) => {
      for (const ref of clip.refs) {
        const refIndex = indexByName.get(ref);
        if (refIndex === undefined) {
          errors.push({
            kind: 'dead-ref',
            name: clip.name,
            ref,
            message: `« ${clip.name} » référence « ${ref} », qui n'existe pas.`,
          });
          continue;
        }
        if (refIndex > i) {
          errors.push({
            kind: 'order',
            name: clip.name,
            ref,
            message: `« ${clip.name} » utilise « ${ref} » avant sa déclaration.`,
          });
        }
      }
    });

    // Cycles (only meaningful once refs resolve, so skip if dead refs exist).
    if (!errors.some((e) => e.kind === 'dead-ref')) {
      const cycleNode = findCycle(clips);
      if (cycleNode) {
        errors.push({
          kind: 'cycle',
          name: cycleNode,
          message: `« ${cycleNode} » fait partie d'un cycle de références.`,
        });
      }
    }

    return errors;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function name(clip: ClipDef): string {
  return clip.name;
}

/** Resolve the simple identifier name of a CallExpression callee, else null. */
function calleeName(call: CallExpression): string | null {
  return call.callee.type === 'Identifier'
    ? (call.callee as Identifier).name
    : null;
}

/**
 * Find the `stack(...)` call inside an initializer (it may be wrapped in a
 * chain, e.g. `stack(...).gain(...)`) and return its identifier arguments.
 * Returns [] for a clip-leaf (call arguments) or a non-clip const.
 */
function stackRefs(init: Node): string[] {
  const stack = findStackCall(init);
  if (!stack) return [];
  const refs: string[] = [];
  for (const arg of stack.arguments) {
    if (arg.type === 'Identifier') refs.push((arg as Identifier).name);
  }
  return refs;
}

/** Walk the chain of an expression to find a `stack(...)` CallExpression. */
function findStackCall(node: Node | null): CallExpression | null {
  let current: Node | null = node;
  while (current) {
    if (current.type === 'CallExpression') {
      const call = current as CallExpression;
      if (calleeName(call) === 'stack') return call;
      // Chained method call: descend into the receiver (callee.object).
      if (call.callee.type === 'MemberExpression') {
        current = (call.callee as MemberExpression).object;
        continue;
      }
    }
    return null;
  }
  return null;
}

/** Detect any cycle in the clip → refs graph; return one node on the cycle. */
function findCycle(clips: ClipDef[]): string | null {
  const refsByName = new Map<string, string[]>();
  for (const clip of clips) refsByName.set(clip.name, clip.refs);

  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();

  const visit = (n: string): string | null => {
    color.set(n, GREY);
    for (const ref of refsByName.get(n) ?? []) {
      if (!refsByName.has(ref)) continue; // not a clip — ignored here
      const c = color.get(ref) ?? WHITE;
      if (c === GREY) return ref;
      if (c === WHITE) {
        const found = visit(ref);
        if (found) return found;
      }
    }
    color.set(n, BLACK);
    return null;
  };

  for (const clip of clips) {
    if ((color.get(clip.name) ?? WHITE) === WHITE) {
      const found = visit(clip.name);
      if (found) return found;
    }
  }
  return null;
}

export const codeRegion: CodeRegion = new CodeRegionImpl();
