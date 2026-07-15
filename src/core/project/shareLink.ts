// Static import (not the top-level `await import(...)` used in StrudelBridgeImpl):
// this is a pure, synchronous helper with no audio-context or user-gesture
// dependency, so there is no reason to defer loading @strudel/core here.
// `code2hash` produces the exact base64/URI-encoded hash the official strudel.cc
// REPL reads from the URL fragment.
import { code2hash } from '@strudel/core';

/** Build a shareable strudel.cc permalink for the given Strudel code. */
export function getStrudelShareLink(code: string): string {
  return `https://strudel.cc/#${code2hash(code)}`;
}
