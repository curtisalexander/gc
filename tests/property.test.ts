import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import Decimal from 'decimal.js';
import { compileGraphExpr, evalCalcExpr } from '../src/parser.js';
import {
  linearRegression, normalCDF, normalIntervalProbability, invNorm, quadRegression,
} from '../src/statistics.js';
import {
  matDet, matInv, matMul, matRREF, matTrans, type Matrix,
} from '../src/matrix.js';

const SEED = 0x6c_63_61_6c;
const RUNS = 250;

function expectRelative(actual: number, expected: number, tolerance = 1e-10): void {
  const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance * scale);
}

function expectStrictRelative(actual: number, expected: number, tolerance: number): void {
  if (expected === 0) {
    expect(actual).toBe(0);
    return;
  }
  const scale = Math.max(Math.abs(actual), Math.abs(expected), Number.MIN_VALUE);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance * scale);
}

function expectMatrixClose(actual: Matrix, expected: Matrix, tolerance = 1e-9): void {
  expect(actual).toHaveLength(expected.length);
  for (let row = 0; row < expected.length; row++) {
    expect(actual[row]).toHaveLength(expected[row]!.length);
    for (let col = 0; col < expected[row]!.length; col++) {
      expectRelative(actual[row]![col]!, expected[row]![col]!, tolerance);
    }
  }
}

const finiteDecimal = fc.integer({ min: -1_000_000, max: 1_000_000 });

describe('generated expression properties', () => {
  it('matches an independent Decimal reference for nested arithmetic', () => {
    fc.assert(fc.property(
      fc.array(finiteDecimal, { minLength: 2, maxLength: 9 }),
      fc.array(fc.constantFrom<'+' | '-' | '*'>('+', '-', '*'), { minLength: 1, maxLength: 8 }),
      (values, operators) => {
        const usedOperators = operators.slice(0, values.length - 1);
        while (usedOperators.length < values.length - 1) usedOperators.push('+');
        let expression = values[0]!.toString();
        let reference = new Decimal(values[0]!);
        for (let i = 1; i < values.length; i++) {
          const operator = usedOperators[i - 1]!;
          expression = `(${expression}${operator}${values[i]})`;
          if (operator === '+') reference = reference.plus(values[i]!);
          else if (operator === '-') reference = reference.minus(values[i]!);
          else reference = reference.times(values[i]!);
        }
        const expected = reference.toNumber();
        if (Number.isFinite(expected)) expectRelative(evalCalcExpr(expression), expected, 2e-15);
      },
    ), { seed: SEED, numRuns: RUNS });
  });

  it('matches Decimal for bounded integer powers and division', () => {
    fc.assert(fc.property(
      fc.integer({ min: -100, max: 100 }),
      fc.integer({ min: 1, max: 100 }),
      fc.integer({ min: 0, max: 8 }),
      (numerator, denominator, exponent) => {
        const expression = `(${numerator}/${denominator})^${exponent}`;
        const expected = new Decimal(numerator).div(denominator).pow(exponent).toNumber();
        expectStrictRelative(evalCalcExpr(expression), expected, 2e-14);
      },
    ), { seed: SEED + 1, numRuns: RUNS });
  });

  it('compiled and direct graph evaluation always agree', () => {
    fc.assert(fc.property(
      fc.tuple(finiteDecimal, finiteDecimal, finiteDecimal, fc.integer({ min: 0, max: 6 })),
      fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
      ([a, b, c, exponent], x) => {
        const expression = `${a}x^${exponent}+${b}x+${c}`;
        expect(compileGraphExpr(expression)(x)).toBe(evalCalcExpr(
          `${a}*(${x})^${exponent}+${b}*(${x})+${c}`,
        ));
      },
    ), { seed: SEED + 2, numRuns: RUNS });
  });
});

const matrixArbitrary = fc.integer({ min: 1, max: 3 }).chain(size =>
  fc.array(fc.integer({ min: -8, max: 8 }), { minLength: size * size, maxLength: size * size })
    .map(values => Array.from({ length: size }, (_, row) =>
      values.slice(row * size, (row + 1) * size))));

const invertibleMatrixArbitrary = fc.integer({ min: 1, max: 3 }).chain(size =>
  fc.array(fc.integer({ min: -5, max: 5 }), { minLength: size * size, maxLength: size * size })
    .map(values => Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, col) => {
        const value = values[row * size + col]!;
        return row === col ? value + 20 : value;
      }))));

describe('randomized matrix invariants', () => {
  it('transpose reverses products', () => {
    fc.assert(fc.property(matrixArbitrary, matrixArbitrary, (A, B) => {
      fc.pre(A.length === B.length);
      expectMatrixClose(matTrans(matMul(A, B)), matMul(matTrans(B), matTrans(A)));
    }), { seed: SEED + 3, numRuns: RUNS });
  });

  it('determinants are multiplicative and agree with the exact 2x2 formula', () => {
    fc.assert(fc.property(invertibleMatrixArbitrary, invertibleMatrixArbitrary, (A, B) => {
      fc.pre(A.length === B.length);
      expectRelative(matDet(matMul(A, B)), matDet(A) * matDet(B), 2e-10);
      if (A.length === 2) {
        const exact = A[0]![0]! * A[1]![1]! - A[0]![1]! * A[1]![0]!;
        expectRelative(matDet(A), exact, 2e-15);
      }
    }), { seed: SEED + 4, numRuns: RUNS });
  });

  it('inverses multiply to identity', () => {
    fc.assert(fc.property(invertibleMatrixArbitrary, (A) => {
      const inverse = matInv(A);
      expect(inverse).not.toBeNull();
      const identity = A.map((row, i) => row.map((_, j) => i === j ? 1 : 0));
      expectMatrixClose(matMul(A, inverse!), identity, 2e-10);
      expectMatrixClose(matMul(inverse!, A), identity, 2e-10);
    }), { seed: SEED + 5, numRuns: RUNS });
  });

  it('RREF is idempotent', () => {
    fc.assert(fc.property(matrixArbitrary, (A) => {
      const once = matRREF(A);
      expectMatrixClose(matRREF(once), once, 2e-10);
    }), { seed: SEED + 6, numRuns: RUNS });
  });
});

describe('generated statistics and independent reference values', () => {
  it('recovers generated linear models', () => {
    fc.assert(fc.property(
      fc.integer({ min: -1_000_000, max: 1_000_000 }),
      fc.integer({ min: -1_000, max: 1_000 }),
      fc.integer({ min: -1_000, max: 1_000 }),
      (offset, slope, intercept) => {
        const xs = [-3, -1, 0, 2, 5].map(value => value + offset);
        const ys = xs.map(x => slope * x + intercept);
        const result = linearRegression(xs, ys);
        if ('error' in result) throw new Error(result.error);
        expectRelative(result.slope, slope, 1e-10);
        expectRelative(result.intercept, intercept, 2e-7);
      },
    ), { seed: SEED + 7, numRuns: RUNS });
  });

  it('recovers translated and scaled quadratic models by prediction', () => {
    fc.assert(fc.property(
      fc.integer({ min: -100_000, max: 100_000 }),
      fc.integer({ min: 1, max: 100 }),
      fc.integer({ min: -20, max: 20 }),
      fc.integer({ min: -20, max: 20 }),
      fc.integer({ min: -20, max: 20 }),
      (offset, spacing, a, b, c) => {
        const xs = [-3, -1, 0, 2, 4].map(value => offset + spacing * value);
        const ys = xs.map(x => a * x * x + b * x + c);
        const result = quadRegression(xs, ys);
        if ('error' in result) throw new Error(result.error);
        for (let i = 0; i < xs.length; i++) {
          const predicted = result.a * xs[i]! ** 2 + result.b * xs[i]! + result.c;
          expectRelative(predicted, ys[i]!, 2e-8);
        }
      },
    ), { seed: SEED + 8, numRuns: RUNS });
  });

  it('matches published standard-normal reference values', () => {
    const references: Array<[number, number]> = [
      [-3, 0.0013498980316301], [-1.96, 0.0249978951482204],
      [0, 0.5], [1, 0.841344746068543], [1.96, 0.97500210485178],
      [3, 0.99865010196837],
    ];
    for (const [z, expected] of references) {
      expect(normalCDF(z)).toBeCloseTo(expected, 6);
    }
  });

  it('is monotonic, symmetric, and round-trips across the tails', () => {
    fc.assert(fc.property(
      fc.double({ min: -7, max: 7, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: -7, max: 7, noNaN: true, noDefaultInfinity: true }),
      (a, b) => {
        const lo = Math.min(a, b), hi = Math.max(a, b);
        expect(normalCDF(lo)).toBeLessThanOrEqual(normalCDF(hi));
        expectRelative(normalCDF(-a), 1 - normalCDF(a), 2e-7);
        expect(normalIntervalProbability(lo, hi)).toBeGreaterThanOrEqual(0);
      },
    ), { seed: SEED + 9, numRuns: RUNS });

    for (const probability of [1e-10, 1e-8, 1e-5, 0.01, 0.5, 0.99, 1 - 1e-8, 1 - 1e-10]) {
      const z = invNorm(probability);
      const expectedTail = Math.min(probability, 1 - probability);
      const actualTail = probability <= 0.5 ? normalCDF(z) : normalCDF(-z);
      expect(Math.abs(actualTail - expectedTail) / expectedTail).toBeLessThanOrEqual(0.01);
    }
  });
});
