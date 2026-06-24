/**
 * CodeRegion — multi-region read/write layer over a Strudel document.
 *
 * The document is the single source of truth and belongs to the user. Panels
 * are guests: each owns one *region* (a span identified by a semantic anchor),
 * never the whole document. This service lets a panel author express a domain
 * rule (clips, output) without navigating raw ESTree nodes, and edit the
 * document by pure string splicing so the preamble and neighbouring regions
 * stay intact, character for character.
 *
 * Hard rules (see CodeRegionImpl):
 * - `source()` slices the original text via acorn offsets — never re-generated.
 * - Reads never route through escodegen (`generate()` normalizes quotes,
 *   re-indents and drops comments — the destructive round-trip).
 * - Offsets are never cached across edits: every write re-resolves its region
 *   from the current text (a splice upstream shifts every offset downstream).
 */

/**
 * A read-only view over one expression node, backed by the exact source text.
 * Lets a rule distinguish a clip-group (identifier arguments) from a clip-leaf
 * (call arguments) without knowing ESTree node names.
 */
export interface CodeQuery {
  /** True for a CallExpression. When `name` is given, also requires the callee
   *  to resolve to that identifier (e.g. `isCall('stack')`). */
  isCall(name?: string): boolean;
  /** True for a bare Identifier (a reference, e.g. a clip-group member). */
  isIdentifier(): boolean;
  /** The identifier name for an Identifier node, else null. */
  identifierName(): string | null;
  /** Arguments of a CallExpression (empty for anything else). */
  args(): CodeQuery[];
  /** Exact source text of this node — a slice of the backing string, never a
   *  re-generate. */
  source(): string;
  /** Absolute offsets within the backing string. */
  readonly start: number;
  readonly end: number;
}

/** A top-level `const name = <init>` declaration. */
export interface ClipDef {
  /** Identifier of the const — the immutable identity of the clip. */
  name: string;
  /** Exact source text of the initializer (the `stack(...)` + its chain). */
  source: string;
  /** Identifiers referenced as arguments of the initializer's `stack(...)`
   *  call (empty for a clip-leaf or a non-clip const). */
  refs: string[];
  /** Offsets of the whole declaration (`const … ;`) in the document. */
  start: number;
  end: number;
}

/** Where the current output lives: the `$:` block, the `arrange(...)` call, or
 *  nothing yet (insertion point at `start === end`). */
export interface OutputRegion {
  kind: 'dollar' | 'arrange' | 'none';
  start: number;
  end: number;
}

/** A violation of the dependency graph's integrity. `[]` means the graph is OK. */
export interface GraphError {
  kind: 'dead-ref' | 'cycle' | 'order' | 'duplicate';
  /** The offending const name. */
  name: string;
  /** The referenced name, for dead-ref / order / cycle errors. */
  ref?: string;
  /** Human-readable, precise message for the error banner. */
  message: string;
}

export interface CodeRegion {
  /** All `const x = …` definitions in source order. null on parse error. */
  readClips(code: string): ClipDef[] | null;

  /** Parse a standalone expression into a query rooted at its node. null if
   *  the source is not a single expression. Offsets are relative to `source`. */
  readExpr(source: string): CodeQuery | null;

  /** Locate the current output region (the `$:` block or the `arrange(...)`). */
  locateOutput(code: string): OutputRegion;

  /** Pure string splice of `[start, end)` → `replacement`. No normalization. */
  spliceSpan(code: string, start: number, end: number, replacement: string): string;

  /** Validate the dependency graph: dead refs, cycles, declaration order,
   *  duplicate names. Returns `[]` when the graph is valid. */
  validateGraph(clips: ClipDef[]): GraphError[];
}
