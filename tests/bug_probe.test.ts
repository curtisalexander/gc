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

describe('BUG PROBE — factorial absorbs preceding function name', () => {
  // Before the fix, `sin(pi)!` scanned back to the matching `(` and took
  // factorial of the inner `pi` only, leaving `sin` dangling. The fix
  // pulls in a preceding identifier so the whole call is factorialized.
  it('sin(pi)! = factorial(sin(π)) = 1 (radians)', () => {
    expect(evalCalcExpr('sin(pi)!', { angleMode: 'rad' })).toBe(1);
  });
  it('abs(-5)! = factorial(5) = 120', () => {
    expect(evalCalcExpr('abs(-5)!')).toBe(120);
  });
  it('nCr(5,2)! = factorial(10) = 3628800', () => {
    expect(evalCalcExpr('nCr(5,2)!')).toBe(3628800);
  });
  it('(2+3)! still works (no preceding identifier)', () => {
    expect(evalCalcExpr('(2+3)!')).toBe(120);
  });
  it('embedded: 3+sin(pi)! = 3 + 1 = 4', () => {
    expect(evalCalcExpr('3+sin(pi)!', { angleMode: 'rad' })).toBe(4);
  });
});

describe('BUG PROBE — pi! and e! surface as Error, not JS SyntaxError', () => {
  // factorial of a non-integer is NaN; without the fix these leaked past
  // the parser because resolveFactorials only recognised `\d!` and `)!`.
  it('pi! returns NaN', () => {
    expect(Number.isNaN(evalCalcExpr('pi!'))).toBe(true);
  });
  it('e! returns NaN', () => {
    expect(Number.isNaN(evalCalcExpr('e!'))).toBe(true);
  });
});

describe('BUG PROBE — chained implicit multiplication', () => {
  // Pre-fix, these were raw JS SyntaxErrors because the \b-anchored
  // implicit-mul rule couldn't match a short name immediately followed
  // by another letter.
  it('2pie = 2·π·e', () => {
    expect(evalCalcExpr('2pie')).toBeCloseTo(2 * Math.PI * Math.E, 9);
  });
  it('2ex in graph view = 2·e·x', () => {
    expect(evalGraphExpr('2ex', 3)).toBeCloseTo(2 * Math.E * 3, 9);
  });
  it('2xx in graph view = 2·x·x', () => {
    expect(evalGraphExpr('2xx', 3)).toBe(18);
  });
  it('2epi = 2·e·π', () => {
    expect(evalCalcExpr('2epi')).toBeCloseTo(2 * Math.E * Math.PI, 9);
  });
  it('2xpi in graph view = 2·x·π', () => {
    expect(evalGraphExpr('2xpi', 3)).toBeCloseTo(6 * Math.PI, 9);
  });
});

describe('BUG PROBE — tan at undefined angles', () => {
  // Math.tan(Math.PI/2) is ~1.6e16 because π/2 can't be represented exactly.
  // The calculator should treat it as undefined.
  it('tan(90°) is NaN, not 1.6e16', () => {
    expect(Number.isNaN(evalCalcExpr('tan(90)', { angleMode: 'deg' }))).toBe(true);
  });
  it('tan(270°) is NaN', () => {
    expect(Number.isNaN(evalCalcExpr('tan(270)', { angleMode: 'deg' }))).toBe(true);
  });
  it('tan(pi/2) in radians is NaN', () => {
    expect(Number.isNaN(evalCalcExpr('tan(pi/2)', { angleMode: 'rad' }))).toBe(true);
  });
  it('tan(45°) still works', () => {
    expect(evalCalcExpr('tan(45)', { angleMode: 'deg' })).toBeCloseTo(1, 9);
  });
});

describe('BUG PROBE — findZeros on identically-zero function', () => {
  it('does not flood the result list with every sample', () => {
    // Pre-fix this returned ~1000 entries for steps=2000 on y=0.
    const z = findZeros('0', -10, 10);
    expect(z.length).toBeLessThanOrEqual(3);
  });
  it('still finds isolated exact zero of y=x at x=0', () => {
    const z = findZeros('x', -10, 10);
    expect(z.some((v) => Math.abs(v) < 1e-9)).toBe(true);
  });
});

describe('BUG PROBE — shift is strictly one-shot across all keys', () => {
  // Previously only pressFn cleared shift; a stray digit or operator would
  // leave shift armed and silently affect the NEXT function press.
  it('pressNum clears shift', () => {
    const c = new Calculator();
    c.toggleShift();
    c.pressNum('5');
    expect(c.isShift()).toBe(false);
  });
  it('pressOp clears shift', () => {
    const c = new Calculator();
    c.toggleShift();
    c.pressOp('+');
    expect(c.isShift()).toBe(false);
  });
  it('pressAns clears shift', () => {
    const c = new Calculator();
    c.toggleShift();
    c.pressAns();
    expect(c.isShift()).toBe(false);
  });
  it('del clears shift', () => {
    const c = new Calculator();
    c.pressNum('5');
    c.toggleShift();
    c.del();
    expect(c.isShift()).toBe(false);
  });
});
