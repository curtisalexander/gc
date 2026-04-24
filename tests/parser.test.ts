import { describe, it, expect } from 'vitest';
import { evalGraphExpr, evalCalcExpr, convertPowers, factorial, comb, perm } from '../src/parser.js';

// Tolerant equality helper.
const close = (actual: number, expected: number, tol = 1e-9) =>
  expect(Math.abs(actual - expected)).toBeLessThan(tol);

describe('evalGraphExpr — arithmetic', () => {
  it('basics', () => {
    expect(evalGraphExpr('2+3', 0)).toBe(5);
    expect(evalGraphExpr('10-3', 0)).toBe(7);
    expect(evalGraphExpr('4*3', 0)).toBe(12);
    expect(evalGraphExpr('15/3', 0)).toBe(5);
  });
  it('order of operations', () => {
    expect(evalGraphExpr('2+3*4', 0)).toBe(14);
    expect(evalGraphExpr('(2+3)*4', 0)).toBe(20);
    expect(evalGraphExpr('2*3+4*5', 0)).toBe(26);
  });
});

describe('evalGraphExpr — implicit multiplication', () => {
  it('number * variable', () => {
    expect(evalGraphExpr('2x', 3)).toBe(6);
    expect(evalGraphExpr('3x+1', 4)).toBe(13);
  });
  it('number * paren', () => {
    expect(evalGraphExpr('2(x+1)', 2)).toBe(6);
    expect(evalGraphExpr('3(x-1)', 5)).toBe(12);
  });
  it('paren * paren', () => {
    expect(evalGraphExpr('(x-1)(x+1)', 3)).toBe(8);
    expect(evalGraphExpr('(x+2)(x-2)', 4)).toBe(12);
  });
  it('number * function', () => {
    close(evalGraphExpr('2sin(0)', 0), 0);
    close(evalGraphExpr('3cos(0)', 0), 3);
  });
  it('paren * function', () => {
    close(evalGraphExpr('(x+1)sin(x)', 0), 0);
  });
  it('xx → x*x (adjacent-variable implicit mul)', () => {
    expect(evalGraphExpr('xx', 4)).toBe(16);
    expect(evalGraphExpr('xxx', 2)).toBe(8);
  });
  it('xpi → x*pi', () => {
    close(evalGraphExpr('xpi', 2), 2 * Math.PI);
  });
});

describe('evalGraphExpr — powers', () => {
  it('integer powers', () => {
    expect(evalGraphExpr('x^2', 3)).toBe(9);
    expect(evalGraphExpr('x^3', 2)).toBe(8);
  });
  it('TI-style: -3^2 = -9 (unary minus has lower precedence)', () => {
    expect(evalGraphExpr('-x^2', 3)).toBe(-9);
    expect(evalGraphExpr('-3^2', 0)).toBe(-9);
  });
  it('right-associative: 2^3^2 = 2^9 = 512', () => {
    expect(evalGraphExpr('2^3^2', 0)).toBe(512);
  });
  it('fractional/negative exponents', () => {
    close(evalGraphExpr('x^(1/2)', 16), 4);
    close(evalGraphExpr('x^(-1)', 4), 0.25);
  });
  it('powers of expressions', () => {
    expect(evalGraphExpr('(x+1)^2', 2)).toBe(9);
    close(evalGraphExpr('(2x)^2', 3), 36);
  });
});

describe('evalGraphExpr — functions', () => {
  it('trig (radians)', () => {
    close(evalGraphExpr('sin(0)', 0), 0);
    close(evalGraphExpr('sin(pi/2)', 0), 1);
    close(evalGraphExpr('cos(0)', 0), 1);
    close(evalGraphExpr('cos(pi)', 0), -1);
    close(evalGraphExpr('tan(0)', 0), 0);
  });
  it('inverse trig (radians)', () => {
    close(evalGraphExpr('asin(1)', 0), Math.PI / 2);
    close(evalGraphExpr('acos(0)', 0), Math.PI / 2);
    close(evalGraphExpr('atan(1)', 0), Math.PI / 4);
  });
  it('roots and abs', () => {
    expect(evalGraphExpr('sqrt(16)', 0)).toBe(4);
    expect(evalGraphExpr('sqrt(x)', 25)).toBe(5);
    expect(evalGraphExpr('abs(x)', -7)).toBe(7);
  });
  it('logs and exp', () => {
    close(evalGraphExpr('log(100)', 0), 2);
    close(evalGraphExpr('log(1000)', 0), 3);
    close(evalGraphExpr('ln(e)', 0), 1);
    close(evalGraphExpr('e^x', 1), Math.E);
    close(evalGraphExpr('exp(0)', 0), 1);
  });
});

describe('evalGraphExpr — constants', () => {
  it('pi and e', () => {
    close(evalGraphExpr('pi', 0), Math.PI);
    close(evalGraphExpr('e', 0), Math.E);
    close(evalGraphExpr('2pi', 0), 2 * Math.PI);
  });
});

describe('evalGraphExpr — scientific notation', () => {
  it('treats Ne±M as a literal', () => {
    expect(evalGraphExpr('1e3', 0)).toBe(1000);
    expect(evalGraphExpr('2.5e-2', 0)).toBe(0.025);
  });
  it('does not collide with the e constant', () => {
    // 2e^x — should be 2 * Math.E^x, not parsed as scientific notation
    close(evalGraphExpr('2e^x', 1), 2 * Math.E);
  });
});

describe('evalGraphExpr — error handling', () => {
  it('returns NaN for empty / nonsense', () => {
    expect(Number.isNaN(evalGraphExpr('', 0))).toBe(true);
    expect(Number.isNaN(evalGraphExpr('!!!', 0))).toBe(true);
    expect(Number.isNaN(evalGraphExpr('sin(', 0))).toBe(true);
  });
  it('returns NaN for sqrt of negative', () => {
    expect(Number.isNaN(evalGraphExpr('sqrt(x)', -1))).toBe(true);
  });
});

describe('evalCalcExpr — arithmetic', () => {
  it('basics', () => {
    expect(evalCalcExpr('2+3')).toBe(5);
    expect(evalCalcExpr('10-3')).toBe(7);
    expect(evalCalcExpr('4*3')).toBe(12);
    expect(evalCalcExpr('15/3')).toBe(5);
  });
  it('chained unary signs collapse', () => {
    expect(evalCalcExpr('5--3')).toBe(8);
    expect(evalCalcExpr('5+-3')).toBe(2);
    expect(evalCalcExpr('--5')).toBe(5);
    expect(evalCalcExpr('-+-5')).toBe(5);
  });
  it('factorials', () => {
    expect(evalCalcExpr('5!')).toBe(120);
    expect(evalCalcExpr('0!')).toBe(1);
    expect(evalCalcExpr('(2+3)!')).toBe(120);
    expect(evalCalcExpr('5!+1')).toBe(121);
    expect(evalCalcExpr('3*4!')).toBe(72);
  });
  it('nCr / nPr', () => {
    expect(evalCalcExpr('nCr(5,2)')).toBe(10);
    expect(evalCalcExpr('nCr(10,0)')).toBe(1);
    expect(evalCalcExpr('nPr(5,2)')).toBe(20);
    expect(evalCalcExpr('nPr(5,5)')).toBe(120);
  });
  it('percent', () => {
    expect(evalCalcExpr('50%')).toBe(0.5);
    expect(evalCalcExpr('200*10%')).toBe(20);
  });
});

describe('evalCalcExpr — angle modes', () => {
  it('degrees', () => {
    close(evalCalcExpr('sin(30)', { angleMode: 'deg' }), 0.5);
    close(evalCalcExpr('cos(60)', { angleMode: 'deg' }), 0.5);
    close(evalCalcExpr('tan(45)', { angleMode: 'deg' }), 1);
    close(evalCalcExpr('asin(0.5)', { angleMode: 'deg' }), 30);
    close(evalCalcExpr('atan(1)', { angleMode: 'deg' }), 45);
  });
  it('radians', () => {
    close(evalCalcExpr('sin(pi/2)', { angleMode: 'rad' }), 1);
    close(evalCalcExpr('cos(pi)', { angleMode: 'rad' }), -1);
    close(evalCalcExpr('asin(1)', { angleMode: 'rad' }), Math.PI / 2);
  });
});

describe('evalCalcExpr — error', () => {
  it('throws on empty', () => {
    expect(() => evalCalcExpr('')).toThrow();
  });
  it('throws on garbage', () => {
    expect(() => evalCalcExpr('+++')).toThrow();
  });
});

describe('convertPowers', () => {
  it('handles right-associativity via lastIndexOf', () => {
    expect(convertPowers('2^3^2')).toBe('Math.pow(2,Math.pow(3,2))');
  });
  it('keeps unary minus on the left of ^', () => {
    expect(convertPowers('-3^2')).toBe('-Math.pow(3,2)');
  });
});

describe('factorial / comb / perm', () => {
  it('factorial', () => {
    expect(factorial(0)).toBe(1);
    expect(factorial(1)).toBe(1);
    expect(factorial(5)).toBe(120);
    expect(factorial(10)).toBe(3628800);
    expect(Number.isNaN(factorial(-1))).toBe(true);
    expect(Number.isNaN(factorial(2.5))).toBe(true);
  });
  it('comb', () => {
    expect(comb(5, 2)).toBe(10);
    expect(comb(6, 3)).toBe(20);
    expect(comb(10, 0)).toBe(1);
    expect(comb(10, 10)).toBe(1);
  });
  it('perm', () => {
    expect(perm(5, 2)).toBe(20);
    expect(perm(5, 5)).toBe(120);
    expect(perm(10, 0)).toBe(1);
  });
});
