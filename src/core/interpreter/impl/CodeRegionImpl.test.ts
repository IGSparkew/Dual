/**
 * Tests for `CodeRegionImpl.chainCalls` — the read that powers the FX Rack and
 * the mixer FX badges. It walks a declaration's initializer chain, returning one
 * `ChainLink` per `.method(args)` call in source order, excluding the root
 * constructor. Spans are DOCUMENT-ABSOLUTE: slicing the code with `start..end`
 * must reproduce the `.method(args)` text exactly (a link is removed by a clean
 * splice), and each arg's span must reproduce its source.
 */
import { describe, it, expect } from 'vitest';
import { codeRegion } from './CodeRegionImpl';

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
