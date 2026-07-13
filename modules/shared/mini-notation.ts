/**
 * Mini-notation helpers shared by the pattern-editing modules (drum grid,
 * piano roll). Pure functions over source text and the CodeRegion façade —
 * no React, no store, no module vocabulary.
 *
 * Both modules edit clips of the session convention `const NAME = stack(...)`
 * whose arguments are bare constructor calls over a mini-notation string
 * (`s("bd sd")`, `note("c3 e3")`). The helpers here answer the two questions
 * they share — "is this argument a bare `<callee>("...")` call?" and "what are
 * the top-level tokens of this mini string?" — while each module keeps its own
 * token grammar (its accepted subset).
 */
import type { PanelCodeApi } from '@layout/api/PanelApi';

/** Split a call expression into its base call and trailing chain text —
 *  `note("c3").sound("piano")` → base `note("c3")`, chain `.sound("piano")`.
 *  Quote-aware paren scan (a `(` inside the mini string cannot unbalance it);
 *  null when no complete base call is found. Purely textual: the caller
 *  validates the whole expression with `readExpr` when the chain matters. */
export function splitChain(source: string): { base: string; chain: string } | null {
  const s = source.trim();
  const open = s.indexOf('(');
  if (open < 0) return null;
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (quote !== null) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) return { base: s.slice(0, i + 1), chain: s.slice(i + 1).trim() };
    }
  }
  return null;
}

/** True when `source` is a single bare call — no `.chain()` after the closing
 *  paren. */
export function isBareCall(source: string): boolean {
  const split = splitChain(source);
  return split !== null && split.chain === '';
}

/** The mini string of a bare `<callee>("...")` expression — `miniOf(api, src,
 *  's')` reads `s("bd sd")` → `bd sd`. null for anything else (chained call,
 *  other callee, non-literal argument). */
export function miniOf(api: PanelCodeApi, source: string, callee: string): string | null {
  if (!isBareCall(source)) return null;
  const q = api.readExpr(source);
  if (!q || !q.isCall() || q.callee() !== callee) return null;
  const args = q.args();
  if (args.length !== 1) return null;
  const literal = args[0].source.match(/^(['"`])([\s\S]*)\1$/);
  return literal ? literal[2] : null;
}

/** Split a mini string into top-level tokens — bracket groups stay intact
 *  (`"bd [hh hh] sd"` → 3 tokens). null on unbalanced brackets; an empty
 *  string yields an empty array. */
export function tokenize(mini: string): string[] | null {
  const tokens: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of mini.trim()) {
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth < 0) return null;
    }
    if (/\s/.test(ch) && depth === 0) {
      if (current) tokens.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (depth !== 0) return null;
  if (current) tokens.push(current);
  return tokens;
}
