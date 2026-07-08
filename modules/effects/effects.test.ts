/**
 * Tests for the FX Rack pure model (`modules/effects/effects.ts`).
 *
 * The rack is a DERIVATION of a clip's chained calls, never a separate state.
 * All reads/writes go through the CodeRegion façade (document-absolute spans),
 * so we feed the real `codeRegion` singleton as the `PanelCodeApi` — the pure
 * functions only touch its read/transform methods (never `write`).
 *
 * Invariants under test: canonical + alias recognition, catalog processing
 * order, `locked` semantics, byte-for-byte splice preservation of the rest of
 * the document, clamping/formatting, and round-trip knob mapping.
 */
import { describe, it, expect } from 'vitest';
import type { PanelCodeApi } from '@layout/api/PanelApi';
import { FX_METHODS } from '@core/types/fx';
import { codeRegion } from '@core/interpreter/impl/CodeRegionImpl';
import {
  EFFECT_CATALOG,
  ownerOf,
  deriveRack,
  addEffect,
  setParam,
  setEnum,
  removeEffect,
  toFxChain,
  paramToNorm,
  normToParam,
  formatParam,
  type UnitDef,
  type ParamDef,
} from './effects';

// The pure functions only use read/transform methods of the façade.
const api = codeRegion as unknown as PanelCodeApi;

function unit(id: string): UnitDef {
  const u = EFFECT_CATALOG.find((x) => x.id === id);
  if (!u) throw new Error(`no such unit ${id}`);
  return u;
}
function param(method: string): ParamDef {
  const owner = ownerOf(method);
  if (!owner || !owner.param) throw new Error(`no such param ${method}`);
  return owner.param;
}

describe('deriveRack — recognition of canonical params and aliases', () => {
  it('groups canonical methods into their units in catalog (processing) order', () => {
    const rack = deriveRack(api, 'const A = s("bd").lpf(800).room(0.4)', 'A')!;
    expect(rack.units.map((u) => u.def.id)).toEqual(['lpf', 'reverb']);
    const lpf = rack.units[0];
    expect(lpf.params[0].def.method).toBe('lpf');
    expect(lpf.params[0].value).toBe(800);
    expect(lpf.locked).toBe(false);
    expect(rack.units[1].params[0].value).toBe(0.4); // room
  });

  it('recognizes an alias and folds it onto the canonical param', () => {
    // `cutoff` is an alias of `lpf` — the unit is the low-pass, value 500.
    const rack = deriveRack(api, 'const A = s("bd").cutoff(500)', 'A')!;
    expect(rack.units).toHaveLength(1);
    expect(rack.units[0].def.id).toBe('lpf');
    expect(rack.units[0].params[0].def.method).toBe('lpf');
    expect(rack.units[0].params[0].value).toBe(500);
  });

  it('collects two params of the same unit', () => {
    const rack = deriveRack(api, 'const A = s("bd").lpf(800).lpq(2)', 'A')!;
    expect(rack.units).toHaveLength(1);
    const lpf = rack.units[0];
    expect(lpf.params.map((p) => p.value)).toEqual([800, 2]);
  });

  it('orders units by the catalog, not by textual position', () => {
    // Reverb written first, low-pass second — the rack still lists lpf first.
    const rack = deriveRack(api, 'const A = s("bd").room(0.4).lpf(800)', 'A')!;
    expect(rack.units.map((u) => u.def.id)).toEqual(['lpf', 'reverb']);
  });

  it('reads a vowel enum unit', () => {
    const rack = deriveRack(api, 'const A = s("bd").vowel("a")', 'A')!;
    expect(rack.units[0].def.id).toBe('vowel');
    expect(rack.units[0].enumValue).toBe('a');
    expect(rack.units[0].locked).toBe(false);
  });
});

describe('deriveRack — locked units', () => {
  it('locks a unit whose arg is a ternary (not a simple literal)', () => {
    const rack = deriveRack(api, 'const A = s("bd").lpf(A_ON ? 800 : 0)', 'A')!;
    expect(rack.units[0].locked).toBe(true);
    expect(rack.units[0].params[0].value).toBeNull();
  });

  it('locks a unit whose arg is a const reference', () => {
    const rack = deriveRack(api, 'const A = s("bd").lpf(CUTOFF)', 'A')!;
    expect(rack.units[0].locked).toBe(true);
    expect(rack.units[0].params[0].value).toBeNull();
  });

  it('locks a unit whose arg is a mini-notation pattern string', () => {
    const rack = deriveRack(api, 'const A = s("bd").lpf("800 2000")', 'A')!;
    expect(rack.units[0].locked).toBe(true);
    expect(rack.units[0].params[0].value).toBeNull();
  });

  it('locks on a duplicated param but still shows the first readable value', () => {
    const rack = deriveRack(api, 'const A = s("bd").lpf(800).lpf(1000)', 'A')!;
    expect(rack.units[0].locked).toBe(true);
    expect(rack.units[0].params[0].value).toBe(800); // first occurrence wins
  });

  it('locks on an unknown vowel while a valid one is fine', () => {
    const bad = deriveRack(api, 'const A = s("bd").vowel("z")', 'A')!;
    expect(bad.units[0].locked).toBe(true);
    expect(bad.units[0].enumValue).toBeNull();
  });

  it('locks the whole unit when a secondary param is unreadable but keeps the readable one', () => {
    const rack = deriveRack(api, 'const A = s("bd").lpf(800).lpq(RES)', 'A')!;
    const lpf = rack.units[0];
    expect(lpf.locked).toBe(true);
    expect(lpf.params[0].value).toBe(800); // lpf readable
    expect(lpf.params[1].value).toBeNull(); // lpq (res) locked
  });
});

describe('deriveRack — out-of-catalog links ignored', () => {
  it('ignores gain/pan/fast/roomfade/lpenv, keeping only catalog units', () => {
    const code = 'const A = s("bd").lpf(800).fast(2).gain(0.5).roomfade(0.5).lpenv(4)';
    const rack = deriveRack(api, code, 'A')!;
    expect(rack.units.map((u) => u.def.id)).toEqual(['lpf']);
  });

  it('returns null when the clip is absent or not a call', () => {
    expect(deriveRack(api, 'const A = 5', 'A')).toBeNull();
    expect(deriveRack(api, 'const A = s("bd")', 'MISSING')).toBeNull();
  });
});

describe('addEffect — append primary param, rest of doc intact', () => {
  it('appends `.lpf(800)` at the end of the initializer', () => {
    const before = 'const A = s("bd")\n$: A\n';
    const after = addEffect(api, before, 'A', unit('lpf'));
    expect(after).toBe('const A = s("bd").lpf(800)\n$: A\n');
  });

  it('appends only the PRIMARY param on add (one call), not the secondary', () => {
    const after = addEffect(api, 'const A = s("bd")', 'A', unit('reverb'));
    expect(after).toBe('const A = s("bd").room(0.4)'); // no roomsize
  });

  it('writes a quoted default for an enum unit', () => {
    const after = addEffect(api, 'const A = s("bd")', 'A', unit('vowel'));
    expect(after).toBe('const A = s("bd").vowel("a")');
  });

  it('formats an integer default for a coarse/crush unit', () => {
    expect(addEffect(api, 'const A = s("bd")', 'A', unit('coarse'))).toBe('const A = s("bd").coarse(4)');
    expect(addEffect(api, 'const A = s("bd")', 'A', unit('crush'))).toBe('const A = s("bd").crush(8)');
  });

  it('preserves comments and unusual spacing around the clip byte for byte', () => {
    const before = '// my kit\nconst A = s("bd") // kick\n\nconst B = s("hh")\n$: stack(A, B)\n';
    const after = addEffect(api, before, 'A', unit('lpf'));
    expect(after).toBe('// my kit\nconst A = s("bd").lpf(800) // kick\n\nconst B = s("hh")\n$: stack(A, B)\n');
  });
});

describe('setParam — splice the argument only', () => {
  it('replaces the existing literal in place', () => {
    const after = setParam(api, 'const A = s("bd").lpf(800)', 'A', param('lpf'), 1000);
    expect(after).toBe('const A = s("bd").lpf(1000)');
  });

  it('keeps the hand-written alias while updating its value', () => {
    const after = setParam(api, 'const A = s("bd").cutoff(500)', 'A', param('lpf'), 900);
    expect(after).toBe('const A = s("bd").cutoff(900)');
  });

  it('lazily provisions an absent secondary param at the end of the chain', () => {
    const after = setParam(api, 'const A = s("bd").lpf(800)', 'A', param('lpq'), 2);
    expect(after).toBe('const A = s("bd").lpf(800).lpq(2)');
  });

  it('clamps above the max and below the min', () => {
    expect(setParam(api, 'const A = s("bd").lpf(800)', 'A', param('lpf'), 999999))
      .toBe('const A = s("bd").lpf(20000)');
    expect(setParam(api, 'const A = s("bd").lpf(800)', 'A', param('lpf'), 5))
      .toBe('const A = s("bd").lpf(20)');
  });

  it('formats non-integer params to 2 decimals max', () => {
    const after = setParam(api, 'const A = s("bd").room(0.4)', 'A', param('room'), 0.123456);
    expect(after).toBe('const A = s("bd").room(0.12)');
  });

  it('rounds crush/coarse to an integer', () => {
    const after = setParam(api, 'const A = s("bd").crush(8)', 'A', param('crush'), 8.7);
    expect(after).toBe('const A = s("bd").crush(9)');
  });

  it('does not disturb the surrounding document', () => {
    const before = 'const A = s("bd").lpf(800)\nconst B = s("hh").room(0.3)\n$: stack(A, B)\n';
    const after = setParam(api, before, 'A', param('lpf'), 1200);
    expect(after).toBe('const A = s("bd").lpf(1200)\nconst B = s("hh").room(0.3)\n$: stack(A, B)\n');
  });
});

describe('setEnum — vowel dropdown', () => {
  it('splices the choice in place, preserving the rest', () => {
    const after = setEnum(api, 'const A = s("bd").vowel("a")', 'A', unit('vowel'), 'e');
    expect(after).toBe('const A = s("bd").vowel("e")');
  });

  it('appends when the vowel is absent', () => {
    const after = setEnum(api, 'const A = s("bd")', 'A', unit('vowel'), 'o');
    expect(after).toBe('const A = s("bd").vowel("o")');
  });

  it('ignores a choice outside the enum', () => {
    const before = 'const A = s("bd").vowel("a")';
    expect(setEnum(api, before, 'A', unit('vowel'), 'zzz')).toBe(before);
  });
});

describe('removeEffect — drop every link of a unit, preserve the rest', () => {
  it('removes all params of a unit (canonical)', () => {
    const after = removeEffect(api, 'const A = s("bd").lpf(800).lpq(2).room(0.4)', 'A', unit('lpf'));
    expect(after).toBe('const A = s("bd").room(0.4)');
  });

  it('removes params written via aliases too', () => {
    const after = removeEffect(api, 'const A = s("bd").cutoff(500).resonance(2).room(0.4)', 'A', unit('lpf'));
    expect(after).toBe('const A = s("bd").room(0.4)');
  });

  it('preserves advanced out-of-catalog params of a related area (roomfade)', () => {
    const after = removeEffect(api, 'const A = s("bd").lpf(800).roomfade(0.5).room(0.4)', 'A', unit('reverb'));
    expect(after).toBe('const A = s("bd").lpf(800).roomfade(0.5)');
  });

  it('leaves the result parsable — list/chainCalls still work', () => {
    const before = 'const A = s("bd").lpf(800).lpq(2).room(0.4).delay(0.25)\n$: A\n';
    const after = removeEffect(api, before, 'A', unit('lpf'));
    expect(after).toBe('const A = s("bd").room(0.4).delay(0.25)\n$: A\n');
    // Re-derive on the result: the low-pass is gone, the rest intact.
    const rack = deriveRack(api, after, 'A')!;
    expect(rack.units.map((u) => u.def.id)).toEqual(['delay', 'reverb']);
    const links = codeRegion.chainCalls(after, 'A')!;
    expect(links.map((l) => l.method)).toEqual(['room', 'delay']);
  });
});

describe('paramToNorm / normToParam — round trips', () => {
  it('round-trips a linear param', () => {
    const p = param('room'); // min 0 max 1 lin
    expect(normToParam(p, paramToNorm(p, 0.4))).toBeCloseTo(0.4, 6);
  });

  it('round-trips a logarithmic param', () => {
    const p = param('lpf'); // min 20 max 20000 log
    expect(normToParam(p, paramToNorm(p, 800))).toBeCloseTo(800, 3);
  });

  it('inverts the crush knob (up = more effect)', () => {
    const p = param('crush'); // inverted, min 1 max 16
    // Max effect (value 1) sits at knob 1; clean (value 16) at knob 0.
    expect(paramToNorm(p, 1)).toBeCloseTo(1, 6);
    expect(paramToNorm(p, 16)).toBeCloseTo(0, 6);
    // Round trip through the inverted integer scale.
    expect(normToParam(p, paramToNorm(p, 8))).toBe(8);
  });
});

describe('toFxChain — snapshot', () => {
  it('projects units and params keyed by canonical method, in catalog order', () => {
    const rack = deriveRack(api, 'const A = s("bd").lpf(800).lpq(2).room(0.4).vowel("a")', 'A')!;
    expect(toFxChain(rack)).toEqual([
      { unit: 'lpf', params: { lpf: 800, lpq: 2 } },
      { unit: 'vowel', params: { vowel: 'a' } },
      { unit: 'reverb', params: { room: 0.4 } },
    ]);
  });

  it('omits absent params and a null enum', () => {
    const rack = deriveRack(api, 'const A = s("bd").lpf(800)', 'A')!;
    expect(toFxChain(rack)).toEqual([{ unit: 'lpf', params: { lpf: 800 } }]);
  });
});

describe('formatParam — direct edge cases', () => {
  it('rounds integer params and clamps to range', () => {
    expect(formatParam(param('crush'), 20)).toBe('16'); // clamp then int
    expect(formatParam(param('coarse'), 0)).toBe('1'); // below min
  });
});

describe('FX_METHODS shared contract (@core/types/fx)', () => {
  it('stays in sync with EFFECT_CATALOG (canonical names + aliases)', () => {
    const fromCatalog = new Set<string>();
    for (const u of EFFECT_CATALOG) {
      for (const p of u.params) {
        fromCatalog.add(p.method);
        for (const a of p.aliases) fromCatalog.add(a);
      }
      if (u.enum) {
        fromCatalog.add(u.enum.method);
        for (const a of u.enum.aliases) fromCatalog.add(a);
      }
    }
    expect([...FX_METHODS].sort()).toEqual([...fromCatalog].sort());
  });
});
