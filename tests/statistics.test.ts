import { describe, it, expect } from 'vitest';
import {
  parseData, median, oneVarStats,
  linearRegression, quadRegression, expRegression,
  normalCDF, invNorm, erf,
  cumSum, deltaList, sortAsc, sortDesc, gaussSolve,
} from '../src/statistics.js';

const close = (a: number, b: number, tol = 1e-6) =>
  expect(Math.abs(a - b)).toBeLessThan(tol);

describe('parseData', () => {
  it('parses comma-separated', () => {
    expect(parseData('1, 2, 3')).toEqual([1, 2, 3]);
  });
  it('parses space-separated', () => {
    expect(parseData('1 2 3')).toEqual([1, 2, 3]);
  });
  it('parses mixed and trims junk', () => {
    expect(parseData('  1, ,2;3   4 ')).toEqual([1, 2, 3, 4]);
  });
  it('rejects non-numeric tokens', () => {
    expect(parseData('1, abc, 2')).toEqual([1, 2]);
  });
  it('handles empty', () => {
    expect(parseData('')).toEqual([]);
  });
});

describe('median', () => {
  it('odd', () => expect(median([1, 2, 3, 4, 5])).toBe(3));
  it('even averages middle two', () => expect(median([1, 2, 3, 4])).toBe(2.5));
  it('empty -> NaN', () => expect(Number.isNaN(median([]))).toBe(true));
});

describe('oneVarStats', () => {
  it('symmetric small set', () => {
    const r = oneVarStats([2, 4, 6, 8, 10])!;
    expect(r.n).toBe(5);
    expect(r.mean).toBe(6);
    expect(r.sum).toBe(30);
    expect(r.median).toBe(6);
    expect(r.min).toBe(2);
    expect(r.max).toBe(10);
    // sample stddev: sqrt(40/4)=sqrt(10) ≈ 3.16228
    close(r.sampleStdDev, Math.sqrt(10));
    // pop stddev: sqrt(40/5)=sqrt(8) ≈ 2.82843
    close(r.popStdDev, Math.sqrt(8));
  });
  it('exclusive Q1/Q3 with odd n', () => {
    // [1,2,3,4,5] -> median=3, lower=[1,2] q1=1.5, upper=[4,5] q3=4.5
    const r = oneVarStats([1, 2, 3, 4, 5])!;
    expect(r.q1).toBe(1.5);
    expect(r.q3).toBe(4.5);
    expect(r.iqr).toBe(3);
  });
  it('exclusive Q1/Q3 with even n', () => {
    // [1,2,3,4] -> lower=[1,2] q1=1.5, upper=[3,4] q3=3.5
    const r = oneVarStats([1, 2, 3, 4])!;
    expect(r.q1).toBe(1.5);
    expect(r.q3).toBe(3.5);
  });
  it('singleton', () => {
    const r = oneVarStats([42])!;
    expect(r.mean).toBe(42);
    expect(r.sampleStdDev).toBe(0);
    expect(r.median).toBe(42);
  });
  it('empty -> null', () => {
    expect(oneVarStats([])).toBeNull();
  });
});

describe('linearRegression', () => {
  it('perfect line: y = 2x', () => {
    const r = linearRegression([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    if ('error' in r) throw new Error(r.error);
    close(r.slope, 2);
    close(r.intercept, 0);
    close(r.r2, 1);
    close(r.r, 1);
  });
  it('perfect line with offset: y = 3x + 1', () => {
    const r = linearRegression([0, 1, 2, 3], [1, 4, 7, 10]);
    if ('error' in r) throw new Error(r.error);
    close(r.slope, 3);
    close(r.intercept, 1);
    close(r.r2, 1);
  });
  it('negative slope flips r sign', () => {
    const r = linearRegression([1, 2, 3, 4], [10, 8, 6, 4]);
    if ('error' in r) throw new Error(r.error);
    close(r.slope, -2);
    close(r.r, -1);
  });
  it('error on no x variation', () => {
    const r = linearRegression([2, 2, 2, 2], [1, 2, 3, 4]);
    expect('error' in r).toBe(true);
  });
});

describe('quadRegression', () => {
  it('perfect parabola: y = x^2', () => {
    const r = quadRegression([-2, -1, 0, 1, 2], [4, 1, 0, 1, 4]);
    if ('error' in r) throw new Error(r.error);
    close(r.a, 1);
    close(r.b, 0);
    close(r.c, 0);
  });
  it('shifted parabola: y = 2x^2 - 3x + 1', () => {
    const xs = [-2, -1, 0, 1, 2, 3];
    const ys = xs.map((x) => 2 * x * x - 3 * x + 1);
    const r = quadRegression(xs, ys);
    if ('error' in r) throw new Error(r.error);
    close(r.a, 2);
    close(r.b, -3);
    close(r.c, 1);
  });
});

describe('expRegression', () => {
  it('perfect exponential: y = 2 * e^(0.5x)', () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = xs.map((x) => 2 * Math.exp(0.5 * x));
    const r = expRegression(xs, ys);
    if ('error' in r) throw new Error(r.error);
    close(r.a, 2);
    close(r.b, 0.5);
  });
  it('rejects non-positive y', () => {
    const r = expRegression([1, 2, 3], [1, 0, 1]);
    expect('error' in r).toBe(true);
  });
});

describe('normal distribution', () => {
  it('normalCDF at known points', () => {
    // P(-1 < Z < 1) ≈ 0.6827
    close(normalCDF(1) - normalCDF(-1), 0.6827, 1e-3);
    // P(-2 < Z < 2) ≈ 0.9545
    close(normalCDF(2) - normalCDF(-2), 0.9545, 1e-3);
    close(normalCDF(0), 0.5, 1e-7);
  });
  it('erf basic identities', () => {
    close(erf(0), 0, 1e-7);
    close(erf(-1), -erf(1), 1e-7);
  });
  it('invNorm round-trips with normalCDF', () => {
    for (const p of [0.1, 0.25, 0.5, 0.75, 0.9, 0.99]) {
      const z = invNorm(p);
      close(normalCDF(z), p, 1e-4);
    }
  });
  it('invNorm with mu/sigma', () => {
    close(invNorm(0.5, 100, 15), 100, 1e-6);
  });
});

describe('list ops', () => {
  it('cumSum', () => expect(cumSum([1, 2, 3, 4])).toEqual([1, 3, 6, 10]));
  it('deltaList', () => expect(deltaList([1, 3, 6, 10])).toEqual([2, 3, 4]));
  it('sortAsc', () => expect(sortAsc([3, 1, 2])).toEqual([1, 2, 3]));
  it('sortDesc', () => expect(sortDesc([1, 3, 2])).toEqual([3, 2, 1]));
});

describe('gaussSolve', () => {
  it('solves a 3x3 system', () => {
    // x+y+z=6, 2y+5z=-4, 2x+5y-z=27 → x=5, y=3, z=-2
    const A = [[1, 1, 1], [0, 2, 5], [2, 5, -1]];
    const b = [6, -4, 27];
    const sol = gaussSolve(A, b);
    expect(sol).not.toBeNull();
    close(sol![0]!, 5);
    close(sol![1]!, 3);
    close(sol![2]!, -2);
  });
  it('returns null for singular system', () => {
    const A = [[1, 2], [2, 4]];
    const b = [3, 6];
    expect(gaussSolve(A, b)).toBeNull();
  });
});
