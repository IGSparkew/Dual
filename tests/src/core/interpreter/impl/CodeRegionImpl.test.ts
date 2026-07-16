/**
 * Tests for `CodeRegionImpl.chainCalls` — the read that powers the FX Rack and
 * the mixer FX badges. It walks a declaration's initializer chain, returning one
 * `ChainLink` per `.method(args)` call in source order, excluding the root
 * constructor. Spans are DOCUMENT-ABSOLUTE: slicing the code with `start..end`
 * must reproduce the `.method(args)` text exactly (a link is removed by a clean
 * splice), and each arg's span must reproduce its source.
 */
import { describe, it, expect } from 'vitest';
import { codeRegion } from '@core/interpreter/impl/CodeRegionImpl';

/** Slice the document with a link's span — must reproduce `.method(args)`. */
function linkText(code: string, link: { start: number; end: number }): string {
  return code.slice(link.start, link.end);
}

describe('chainCalls — simple chain', () => {
  const code = 'const A = s("bd").lpf(800).room(0.4)';

  it('returns one link per chained method, in source order, excluding the root', () => {
    const links = codeRegion.chainCalls(code, 'A');
    expect(links).not.toBeNull();
    expect(links!.map((l) => l.method)).toEqual(['lpf', 'room']);
    // The root constructor `s(...)` never surfaces as a link.
    expect(links!.map((l) => l.method)).not.toContain('s');
  });

  it('spans are document-absolute and reproduce `.method(args)` exactly', () => {
    const links = codeRegion.chainCalls(code, 'A')!;
    expect(linkText(code, links[0])).toBe('.lpf(800)');
    expect(linkText(code, links[1])).toBe('.room(0.4)');
    // start = offset of the opening dot; end = just after the closing paren.
    expect(code[links[0].start]).toBe('.');
    expect(code[links[0].end - 1]).toBe(')');
  });

  it('exposes each argument with a document-absolute span and literal source', () => {
    const links = codeRegion.chainCalls(code, 'A')!;
    expect(links[0].args).toHaveLength(1);
    expect(links[0].args[0].source).toBe('800');
    expect(links[0].args[0].isIdentifier).toBe(false);
    expect(code.slice(links[0].args[0].start, links[0].args[0].end)).toBe('800');
    expect(links[1].args[0].source).toBe('0.4');
  });
});

describe('chainCalls — absence and non-call initializers', () => {
  it('returns null when the declaration is absent', () => {
    expect(codeRegion.chainCalls('const A = s("bd").lpf(800)', 'MISSING')).toBeNull();
  });

  it('returns null when the initializer is a plain value (number)', () => {
    expect(codeRegion.chainCalls('const A = 5', 'A')).toBeNull();
  });

  it('returns null when the initializer is a plain string', () => {
    expect(codeRegion.chainCalls('const A = "bd sd"', 'A')).toBeNull();
  });

  it('returns an empty array for a bare constructor with no chained calls', () => {
    expect(codeRegion.chainCalls('const A = s("bd")', 'A')).toEqual([]);
  });

  it('returns null when the whole document fails to parse', () => {
    expect(codeRegion.chainCalls('const A = s("bd".lpf(', 'A')).toBeNull();
  });
});

describe('chainCalls — argument shapes', () => {
  it('reports multiple flat arguments with individual spans', () => {
    const code = 'const A = x.range(0.2, 0.8)';
    const links = codeRegion.chainCalls(code, 'A')!;
    expect(links).toHaveLength(1);
    expect(links[0].method).toBe('range');
    expect(links[0].args.map((a) => a.source)).toEqual(['0.2', '0.8']);
    for (const arg of links[0].args) {
      expect(code.slice(arg.start, arg.end)).toBe(arg.source);
    }
  });

  it('keeps a nested/imputed call (ternary) as a single opaque argument', () => {
    const code = 'const A = s("bd").gain(A_ON ? A_GAIN : 0)';
    const links = codeRegion.chainCalls(code, 'A')!;
    expect(links).toHaveLength(1);
    expect(links[0].method).toBe('gain');
    expect(links[0].args).toHaveLength(1);
    expect(links[0].args[0].source).toBe('A_ON ? A_GAIN : 0');
    expect(links[0].args[0].isIdentifier).toBe(false);
    expect(linkText(code, links[0])).toBe('.gain(A_ON ? A_GAIN : 0)');
  });

  it('flags a bare identifier argument as isIdentifier', () => {
    const code = 'const A = s("bd").gain(VOL)';
    const links = codeRegion.chainCalls(code, 'A')!;
    expect(links[0].args[0].isIdentifier).toBe(true);
    expect(links[0].args[0].source).toBe('VOL');
  });
});

describe('chainCalls — multiline chains', () => {
  const code = ['const A = s("bd")', '  .lpf(800)', '  .room(0.4)'].join('\n');

  it('locates the opening dot across whitespace/newlines and slices exactly', () => {
    const links = codeRegion.chainCalls(code, 'A')!;
    expect(links.map((l) => l.method)).toEqual(['lpf', 'room']);
    expect(linkText(code, links[0])).toBe('.lpf(800)');
    expect(linkText(code, links[1])).toBe('.room(0.4)');
    expect(code[links[0].start]).toBe('.');
    expect(code[links[1].start]).toBe('.');
  });
});

describe('chainCalls — computed members and optional chaining (no crash)', () => {
  it('ignores a computed member call `x["lpf"](1)` without crashing (empty chain)', () => {
    expect(() => codeRegion.chainCalls('const A = x["lpf"](1)', 'A')).not.toThrow();
    expect(codeRegion.chainCalls('const A = x["lpf"](1)', 'A')).toEqual([]);
  });

  it('skips a computed link inside a real chain, keeping the plain ones', () => {
    // `s("bd")["lpf"](800).room(0.4)` — the computed `["lpf"]` link is dropped;
    // `.room` (a plain member) survives.
    const code = 'const A = s("bd")["lpf"](800).room(0.4)';
    const links = codeRegion.chainCalls(code, 'A')!;
    expect(links.map((l) => l.method)).toEqual(['room']);
  });

  it('returns null (not a crash) when the initializer uses optional chaining', () => {
    // Optional chaining makes the whole initializer a ChainExpression, not a
    // CallExpression — the rack cannot manage it, so it steps back (null).
    expect(() => codeRegion.chainCalls('const A = s("bd").lpf(800)?.room(0.4)', 'A')).not.toThrow();
    expect(codeRegion.chainCalls('const A = s("bd").lpf(800)?.room(0.4)', 'A')).toBeNull();
  });
});

describe('chainCalls — targets the right declaration among several', () => {
  const code = [
    'const A = s("bd").lpf(400)',
    'const B = s("sd").room(0.2).delay(0.3)',
    '$: stack(A, B)',
  ].join('\n');

  it('reads B independently of A, with spans valid in the full document', () => {
    const links = codeRegion.chainCalls(code, 'B')!;
    expect(links.map((l) => l.method)).toEqual(['room', 'delay']);
    expect(linkText(code, links[0])).toBe('.room(0.2)');
    expect(linkText(code, links[1])).toBe('.delay(0.3)');
  });
});

/**
 * Tests for `leadingCallArgs` / `setLeadingCall` — the read/write pair that lets
 * the Transport keep the tempo in the document as a leading `setcps(cps)` call.
 * The write must splice the argument in place (callee, parens and the rest of
 * the document byte-identical), or prepend the call when absent WITHOUT ever
 * displacing the trailing output (the transpiler's hard rule: the document must
 * still end on an evaluable expression).
 */
describe('leadingCallArgs — read', () => {
  it('returns the args of the first top-level bare call', () => {
    const args = codeRegion.leadingCallArgs('setcps(0.5)\n$: s("bd")', 'setcps')!;
    expect(args).not.toBeNull();
    expect(args.map((a) => a.source)).toEqual(['0.5']);
  });

  it('exposes document-absolute spans that reproduce the argument source', () => {
    const code = 'setcps(0.5333)\n$: s("bd")';
    const args = codeRegion.leadingCallArgs(code, 'setcps')!;
    expect(code.slice(args[0].start, args[0].end)).toBe('0.5333');
  });

  it('returns null when no such call exists', () => {
    expect(codeRegion.leadingCallArgs('$: s("bd")', 'setcps')).toBeNull();
  });

  it('ignores a same-named call used as a declaration initializer, not a statement', () => {
    // `const x = setcps(...)` is not a bare top-level call statement.
    expect(codeRegion.leadingCallArgs('const x = setcps(0.5)\n$: s("bd")', 'setcps')).toBeNull();
  });

  it('returns null on a broken document', () => {
    expect(codeRegion.leadingCallArgs('setcps(0.5', 'setcps')).toBeNull();
  });
});

describe('setLeadingCall — write in place', () => {
  it('replaces only the argument span, leaving callee, parens and rest intact', () => {
    const code = 'setcps(0.5)\n$: s("bd")';
    const next = codeRegion.setLeadingCall(code, 'setcps', '0.6');
    expect(next).toBe('setcps(0.6)\n$: s("bd")');
  });

  it('preserves a leading comment and surrounding whitespace', () => {
    const code = '// tempo\nsetcps( 0.5 )\n$: s("bd")';
    const next = codeRegion.setLeadingCall(code, 'setcps', '0.6');
    // Only the inner argument text is swapped; the surrounding spaces stay.
    expect(next).toBe('// tempo\nsetcps( 0.6 )\n$: s("bd")');
  });

  it('is idempotent for the same argument (byte-identical)', () => {
    const code = 'setcps(0.5)\n$: s("bd")';
    expect(codeRegion.setLeadingCall(code, 'setcps', '0.5')).toBe(code);
  });
});

describe('setLeadingCall — insert when absent', () => {
  it('prepends the call as the first line, keeping the trailing output last', () => {
    const code = '$: s("bd")';
    const next = codeRegion.setLeadingCall(code, 'setcps', '0.5');
    expect(next).toBe('setcps(0.5);\n$: s("bd")');
    // Transpiler safety: the document still ends on the evaluable output.
    expect(codeRegion.locateOutput(next).kind).toBe('dollar');
    expect(codeRegion.outputSource(next)).toBe('$: s("bd")');
    // The output region really is the document tail (nothing after it).
    expect(next.endsWith('$: s("bd")')).toBe(true);
  });

  it('does not disturb existing declarations, output stays last', () => {
    const code = 'const A = s("bd")\n$: A';
    const next = codeRegion.setLeadingCall(code, 'setcps', '0.5');
    expect(next).toBe('setcps(0.5);\nconst A = s("bd")\n$: A');
    const decls = codeRegion.list(next)!;
    expect(decls.map((d) => d.name)).toEqual(['A']);
  });

  it('handles an empty document', () => {
    expect(codeRegion.setLeadingCall('', 'setcps', '0.5')).toBe('setcps(0.5);\n');
  });

  it('leaves a broken document untouched', () => {
    const broken = 'setcps(0.5\n$: s("bd")';
    expect(codeRegion.setLeadingCall(broken, 'setcps', '0.6')).toBe(broken);
  });
});
