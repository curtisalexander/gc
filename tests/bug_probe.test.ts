// Probing tests for suspected bugs. Each describe block documents the
// behavior we expect a "tip-top" calculator to have. Failures here = real bugs.

import { describe, it, expect } from 'vitest';
import { Calculator } from '../src/calculator.js';
import { evalCalcExpr, evalGraphExpr, comb } from '../src/parser.js';
import { findZeros } from '../src/graphing.js';

describe('BUG PROBE — calculator shift state', () => {
  it('shift+xʸ should clear the shift flag (consistency with other shifted keys)', () => {
    // The xʸ key has a "ˣ√y" shift label printed on it but no SHIFT_MAP
    // entry. Pressing it while shifted should at minimum *clear* the shift
    // flag — otherwise shift gets "stuck" and silently affects the next
    // keypress.
    const c = new Calculator();
    c.pressNum('5');
    c.toggleShift();
    expect(c.isShift()).toBe(true);
    c.pressFn('^');
    // The bug: shift remains on, will silently affect the next keypress.
    expect(c.isShift()).toBe(false);
  });

  it('shift gets cleared after pressing the parens key', () => {
    const c = new Calculator();
    c.toggleShift();
    c.pressFn('()');
    expect(c.isShift()).toBe(false);
  });

  it('shift gets cleared after pressing nCr', () => {
    const c = new Calculator();
    c.toggleShift();
    c.pressFn('nCr(');
    expect(c.isShift()).toBe(false);
  });

  it('shift gets cleared after pressing |x|', () => {
    const c = new Calculator();
    c.toggleShift();
    c.pressFn('abs(');
    expect(c.isShift()).toBe(false);
  });
});

describe('BUG PROBE — calc trig should snap tiny values to zero', () => {
  it('cos(90°) should be exactly 0, not 6e-17', () => {
    // Math.cos(Math.PI/2) leaks ~6.12e-17. A scientific calculator should
    // collapse this to 0 — otherwise the user sees "6.123234e-17" for a
    // result that should obviously be zero.
    expect(evalCalcExpr('cos(90)', { angleMode: 'deg' })).toBe(0);
  });

  it('sin(180°) should be exactly 0', () => {
    expect(evalCalcExpr('sin(180)', { angleMode: 'deg' })).toBe(0);
  });

  it('tan(180°) should be exactly 0', () => {
    expect(evalCalcExpr('tan(180)', { angleMode: 'deg' })).toBe(0);
  });

  it('sin(360°) should be exactly 0', () => {
    expect(evalCalcExpr('sin(360)', { angleMode: 'deg' })).toBe(0);
  });
});

describe('BUG PROBE — comb(n, r) when r > n', () => {
  it('comb(3, 5) should be 0 (mathematically C(n,r)=0 when r>n), not NaN', () => {
    // Most calculators return 0 for this case. NaN cascades into "Error" on
    // the display, which is misleading.
    expect(comb(3, 5)).toBe(0);
  });
});

describe('BUG PROBE — implicit multiplication coverage', () => {
  it('e*pi typed as `epi` should equal e*pi', () => {
    // `2pi` works (digit-then-name) but `epi` (e adjacent to pi) does not.
    // Inconsistent with the implicit-mul promise.
    expect(evalCalcExpr('epi')).toBeCloseTo(Math.E * Math.PI, 9);
  });

  it('e*x typed as `ex` in the graph view', () => {
    expect(evalGraphExpr('ex', 2)).toBeCloseTo(Math.E * 2, 9);
  });
});

describe('BUG PROBE — findZeros completeness for sin(x) on [-π, π]', () => {
  it('finds all three roots: -π, 0, π', () => {
    const z = findZeros('sin(x)', -Math.PI, Math.PI);
    const hasNegPi = z.some((v) => Math.abs(v + Math.PI) < 1e-3);
    const hasZero = z.some((v) => Math.abs(v) < 1e-3);
    const hasPosPi = z.some((v) => Math.abs(v - Math.PI) < 1e-3);
    expect({ hasNegPi, hasZero, hasPosPi }).toEqual(
      { hasNegPi: true, hasZero: true, hasPosPi: true },
    );
  });
});

describe('BUG PROBE — calculator equals after Infinity', () => {
  it('1/0 should not blow up state', () => {
    const c = new Calculator();
    c.pressNum('1'); c.pressOp('/'); c.pressNum('0');
    c.equals();
    // Either show ∞ or Error — but state should be sane.
    const s = c.snapshot();
    expect(['+∞', 'Error']).toContain(s.result);
  });
});

describe('BUG PROBE — formatResult negative-zero', () => {
  it('-0 should display as "0", not "-0"', () => {
    // Tested by reading the source — Calc result for cos(pi/2)*0 etc could
    // produce -0. Explicit check.
    const c = new Calculator();
    c.pressNum('0'); c.pressOp('*'); c.pressOp('-'); c.pressNum('5');
    c.equals();
    expect(c.snapshot().result).not.toContain('-0');
  });
});

describe('BUG PROBE — double factorial does not silently misbehave', () => {
  it('5!! is rejected rather than computed as (5!)!', () => {
    // Naive consecutive ! handling silently produces 120! ≈ 6.7e198, which
    // is not what `!!` means in math. Reject so the user sees Error.
    expect(() => evalCalcExpr('5!!')).toThrow();
  });
});
