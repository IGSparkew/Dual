/**
 * Tests for `getStrudelShareLink` (`src/core/project/shareLink.ts`).
 *
 * Gotcha: the `@strudel/core` BARREL breaks under vitest/Node — a transitive
 * dependency (`@kabelsalat/web`) ships a broken ESM `main` ("does not provide
 * an export named 'SalatRepl'"). The FX Rack tests and `src/strudel.d.ts` work
 * around this by importing the `@strudel/core/util.mjs` SUBPATH directly,
 * which does not pull in the broken dependency chain. `shareLink.ts` itself
 * imports `code2hash` from the barrel (deliberately — see its own comment),
 * so here we `vi.mock('@strudel/core', ...)` to re-export the real
 * `code2hash` sourced from the working subpath, keeping the assertion honest
 * (real hashing logic, not a stub) without ever touching the broken barrel.
 *
 * `src/strudel.d.ts` (production file, not touched here) only types
 * `noteToMidi` on the `util.mjs` subpath, so `code2hash`/`hash2code` are
 * pulled through a namespace import cast rather than a named import — this
 * keeps `tsc --noEmit` clean without editing the ambient declaration.
 */
import { describe, it, expect, vi } from 'vitest';

interface CoreUtilHashing {
  code2hash(code: string): string;
  hash2code(hash: string): string;
}

async function loadCoreUtilHashing(): Promise<CoreUtilHashing> {
  const mod = await import('@strudel/core/util.mjs');
  return mod as unknown as CoreUtilHashing;
}

vi.mock('@strudel/core', async () => {
  const { code2hash } = await loadCoreUtilHashing();
  return { code2hash };
});

import { getStrudelShareLink } from '@core/project/shareLink';

describe('getStrudelShareLink', () => {
  it('builds a strudel.cc permalink prefixed with the # fragment', () => {
    const link = getStrudelShareLink('s("bd sd")');
    expect(link.startsWith('https://strudel.cc/#')).toBe(true);
  });

  it('the fragment is exactly code2hash(code) — matches the official REPL format', async () => {
    const { code2hash } = await loadCoreUtilHashing();
    const code = 'note("c3 e3 g3").s("piano")';
    expect(getStrudelShareLink(code)).toBe(`https://strudel.cc/#${code2hash(code)}`);
  });

  it('round-trips through hash2code back to the original source', async () => {
    const { hash2code } = await loadCoreUtilHashing();
    const code = 's("bd*4, ~ cp").room(0.4)';
    const link = getStrudelShareLink(code);
    const hash = link.slice('https://strudel.cc/#'.length);
    expect(hash2code(decodeURIComponent(hash))).toBe(code);
  });

  it('produces distinct links for distinct code (no accidental caching/memoization)', () => {
    const a = getStrudelShareLink('s("bd")');
    const b = getStrudelShareLink('s("sd")');
    expect(a).not.toBe(b);
  });

  it('handles empty code without throwing', async () => {
    const { code2hash } = await loadCoreUtilHashing();
    expect(() => getStrudelShareLink('')).not.toThrow();
    expect(getStrudelShareLink('')).toBe(`https://strudel.cc/#${code2hash('')}`);
  });

  it('is URI-safe: the fragment contains no raw spaces or unencoded quotes', () => {
    const link = getStrudelShareLink('note("c e g").s("piano") // a comment with spaces');
    const hash = link.slice('https://strudel.cc/#'.length);
    expect(hash).not.toMatch(/[\s"]/);
  });
});
