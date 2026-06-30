import type {
  CodeRegion,
  ExprQuery,
  Decl,
  DeclKind,
  OutputRegion,
  DollarExpr,
  CallArg,
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
  kind: DeclKind;
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

/** A query over an arbitrary expression node — structural classification only. */
class ExprQueryImpl implements ExprQuery {
  constructor(private readonly node: Node) {}

  isCall(): boolean {
    return this.node.type === 'CallExpression';
  }
}

export class CodeRegionImpl implements CodeRegion {
  // ── Reads ──────────────────────────────────────────────────────────────────

  list(code: string): Decl[] | null {
    let ast: Program;
    try {
      ast = astManipulatorImpl.parse(code) as Program;
    } catch {
      return null;
    }

    const decls: Decl[] = [];
    for (const stmt of ast.body) {
      if (stmt.type !== 'VariableDeclaration') continue;
      const decl = stmt as VariableDeclaration;

      for (const d of decl.declarations) {
        if (d.id.type !== 'Identifier' || !d.id.name || !d.init) continue;
        const init = d.init;
        const isCall = init.type === 'CallExpression';
        decls.push({
          name: d.id.name,
          declKind: decl.kind,
          initKind: isCall ? 'pattern' : 'value',
          callee: isCall ? rootCalleeName(init) ?? undefined : undefined,
          source: code.slice(init.start, init.end),
          refs: callRefs(init),
          // Span the whole declaration so a delete removes `… ;` cleanly.
          start: decl.start,
          end: decl.end,
          initStart: init.start,
          initEnd: init.end,
        });
      }
    }
    return decls;
  }

  readExpr(source: string): ExprQuery | null {
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
    return new ExprQueryImpl(stmt.expression);
  }

  locateOutput(code: string): OutputRegion {
    let ast: Program;
    try {
      ast = astManipulatorImpl.parse(code) as Program;
    } catch {
      return { kind: 'none' };
    }

    // Prefer the contiguous block of `$:` labeled statements.
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

    // Otherwise the last terminal expression statement is the live output.
    for (let i = ast.body.length - 1; i >= 0; i--) {
      const stmt = ast.body[i];
      if (stmt.type === 'ExpressionStatement') {
        return { kind: 'expression', start: stmt.start, end: stmt.end };
      }
    }

    return { kind: 'none' };
  }

  dollarExprs(code: string): DollarExpr[] {
    let ast: Program;
    try {
      ast = astManipulatorImpl.parse(code) as Program;
    } catch {
      return [];
    }

    const exprs: DollarExpr[] = [];
    for (const stmt of ast.body) {
      if (stmt.type !== 'LabeledStatement') continue;
      const labeled = stmt as LabeledStatement;
      if (labeled.label.name !== DOLLAR_LABEL) continue;
      if (labeled.body.type !== 'ExpressionStatement') continue;
      const expr = (labeled.body as ExpressionStatement).expression;
      exprs.push({
        source: code.slice(expr.start, expr.end),
        isIdentifier: expr.type === 'Identifier',
      });
    }
    return exprs;
  }

  callArgs(code: string, name: string): CallArg[] | null {
    let ast: Program;
    try {
      ast = astManipulatorImpl.parse(code) as Program;
    } catch {
      return null;
    }

    for (const stmt of ast.body) {
      if (stmt.type !== 'VariableDeclaration') continue;
      for (const d of (stmt as VariableDeclaration).declarations) {
        if (d.id.type !== 'Identifier' || d.id.name !== name || !d.init) continue;
        const call = rootCall(d.init);
        if (!call) return null;
        return call.arguments.map((arg) => ({
          source: code.slice(arg.start, arg.end),
          isIdentifier: arg.type === 'Identifier',
          start: arg.start,
          end: arg.end,
        }));
      }
    }
    return null;
  }

  validateGraph(decls: Decl[]): GraphError[] {
    const errors: GraphError[] = [];

    // Index by name; flag duplicates.
    const indexByName = new Map<string, number>();
    decls.forEach((decl, i) => {
      if (indexByName.has(decl.name)) {
        errors.push({
          kind: 'duplicate',
          detail: `« ${decl.name} » est déclaré plusieurs fois.`,
        });
      } else {
        indexByName.set(decl.name, i);
      }
    });

    // Dead refs + declaration order (a const used before it is declared throws
    // at eval time — reported as a dead reference for the consumer's banner).
    decls.forEach((decl, i) => {
      for (const ref of decl.refs) {
        const refIndex = indexByName.get(ref);
        if (refIndex === undefined) {
          errors.push({
            kind: 'dead-ref',
            detail: `« ${decl.name} » référence « ${ref} », qui n'existe pas.`,
          });
          continue;
        }
        if (refIndex > i) {
          errors.push({
            kind: 'dead-ref',
            detail: `« ${decl.name} » utilise « ${ref} » avant sa déclaration.`,
          });
        }
      }
    });

    // Cycles (only meaningful once refs resolve, so skip if dead refs exist).
    if (!errors.some((e) => e.kind === 'dead-ref')) {
      const cycleNode = findCycle(decls);
      if (cycleNode) {
        errors.push({
          kind: 'cycle',
          detail: `« ${cycleNode} » fait partie d'un cycle de références.`,
        });
      }
    }

    return errors;
  }

  // ── Transforms ─────────────────────────────────────────────────────────────

  insertDecl(code: string, declText: string): string {
    const output = this.locateOutput(code);
    const at = output.kind !== 'none' ? output.start : code.length;
    const head = code.slice(0, at);
    const tail = code.slice(at);
    const pre = head === '' || head.endsWith('\n') ? head : `${head}\n`;
    return `${pre}${declText.trim()}\n${tail}`;
  }

  removeDecl(code: string, name: string): string {
    const decl = this.list(code)?.find((d) => d.name === name);
    if (!decl) return code;
    let end = decl.end;
    while (code[end] === '\n') end++;
    return code.slice(0, decl.start) + code.slice(end);
  }

  setInit(code: string, name: string, source: string): string {
    const decl = this.list(code)?.find((d) => d.name === name);
    if (!decl) return code;
    return this.spliceSpan(code, decl.initStart, decl.initEnd, source);
  }

  setOutput(code: string, text: string): string {
    const output = this.locateOutput(code);
    if (output.kind === 'none') return appendLine(code, text);
    return this.spliceSpan(code, output.start, output.end, text);
  }

  removeOutput(code: string): string {
    const output = this.locateOutput(code);
    if (output.kind === 'none') return code;
    let end = output.end;
    while (code[end] === '\n') end++;
    return code.slice(0, output.start) + code.slice(end);
  }

  // ── Raw ────────────────────────────────────────────────────────────────────

  spliceSpan(code: string, start: number, end: number, replacement: string): string {
    return code.slice(0, start) + replacement + code.slice(end);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Append `text` as a trailing line, ensuring a newline separation. */
function appendLine(code: string, text: string): string {
  const pre = code === '' || code.endsWith('\n') ? code : `${code}\n`;
  return `${pre}${text}\n`;
}

/** Resolve the simple identifier name of a CallExpression callee, else null. */
function calleeName(call: CallExpression): string | null {
  return call.callee.type === 'Identifier'
    ? (call.callee as Identifier).name
    : null;
}

/**
 * Walk the chain of an initializer to its root constructor call. For
 * `stack(a, b).gain(x)` the root is the `stack(...)` call; for a bare
 * `stack(...)` it is itself. Returns null when there is no call.
 */
function rootCall(node: Node | null): CallExpression | null {
  let current: Node | null = node;
  let root: CallExpression | null = null;
  while (current && current.type === 'CallExpression') {
    const call = current as CallExpression;
    root = call;
    // Chained method call: descend into the receiver (callee.object).
    if (call.callee.type === 'MemberExpression') {
      current = (call.callee as MemberExpression).object;
      continue;
    }
    break;
  }
  return root;
}

/** Name of the root constructor call (`stack(a).gain(x)` → 'stack'), else null. */
function rootCalleeName(init: Node): string | null {
  const call = rootCall(init);
  return call ? calleeName(call) : null;
}

/**
 * Identifier arguments of an initializer's root call — the references that bind
 * this declaration to others (e.g. the members of a `stack(a, b)`). Empty for a
 * leaf (`stack(s("bd"))`) or a non-call initializer.
 */
function callRefs(init: Node): string[] {
  const call = rootCall(init);
  if (!call) return [];
  const refs: string[] = [];
  for (const arg of call.arguments) {
    if (arg.type === 'Identifier') refs.push((arg as Identifier).name);
  }
  return refs;
}

/** Detect any cycle in the decl → refs graph; return one node on the cycle. */
function findCycle(decls: Decl[]): string | null {
  const refsByName = new Map<string, string[]>();
  for (const decl of decls) refsByName.set(decl.name, decl.refs);

  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();

  const visit = (n: string): string | null => {
    color.set(n, GREY);
    for (const ref of refsByName.get(n) ?? []) {
      if (!refsByName.has(ref)) continue; // not a decl — ignored here
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

  for (const decl of decls) {
    if ((color.get(decl.name) ?? WHITE) === WHITE) {
      const found = visit(decl.name);
      if (found) return found;
    }
  }
  return null;
}

export const codeRegion: CodeRegion = new CodeRegionImpl();
