import { describe, it, expect } from 'vitest';
import { findZeros, squareWindow, zoomedWindow, panWindow, worldToCanvas, canvasToWorld } from '../src/graphing.js';
import { niceStep, fmtNum, formatResult } from '../src/format.js';

const close = (a: number, b: number, tol = 1e-4) =>
  expect(Math.abs(a - b)).toBeLessThan(tol);

describe('findZeros', () => {
  it('finds sin(x) zeros in [-pi, pi]', () => {
    const z = findZeros('sin(x)', -Math.PI, Math.PI);
    // Zeros at -π, 0, π. endpoints should land within tolerance.
    expect(z.length).toBeGreaterThanOrEqual(1);
    expect(z.some((v) => Math.abs(v) < 1e-3)).toBe(true);
  });
  it('finds roots of x^2 - 4', () => {
    const z = findZeros('x^2-4', -5, 5);
    expect(z.length).toBe(2);
    expect(z.some((v) => Math.abs(v - 2) < 1e-4)).toBe(true);
    expect(z.some((v) => Math.abs(v + 2) < 1e-4)).toBe(true);
  });
  it('skips asymptote of 1/x (not a real zero)', () => {
    const z = findZeros('1/x', -5, 5);
    // Magnitude at x near 0 should be detected as asymptote and skipped.
    expect(z.length).toBe(0);
  });
  it('returns empty for no-zero function', () => {
    expect(findZeros('x^2+1', -5, 5)).toEqual([]);
  });
});

describe('viewport math', () => {
  const w = { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };

  it('worldToCanvas origin maps to center', () => {
    const [cx, cy] = worldToCanvas(0, 0, w, 400, 400);
    expect(cx).toBe(200);
    expect(cy).toBe(200);
  });
  it('canvasToWorld is inverse of worldToCanvas', () => {
    const [cx, cy] = worldToCanvas(3, -2, w, 400, 400);
    const [wx, wy] = canvasToWorld(cx, cy, w, 400, 400);
    close(wx, 3);
    close(wy, -2);
  });

  it('zoomedWindow in', () => {
    const z = zoomedWindow(w, 0.5);
    expect(z).toEqual({ xmin: -5, xmax: 5, ymin: -5, ymax: 5 });
  });
  it('zoomedWindow out', () => {
    const z = zoomedWindow(w, 2);
    expect(z).toEqual({ xmin: -20, xmax: 20, ymin: -20, ymax: 20 });
  });
  it('panWindow', () => {
    expect(panWindow(w, 2, -3)).toEqual({ xmin: -12, xmax: 8, ymin: -7, ymax: 13 });
  });

  it('squareWindow preserves Y center (regression test for previous bug)', () => {
    // Previously the bug used cx for the Y center, dragging Y off the X axis.
    // Window with asymmetric Y: center at y=5.
    const asym = { xmin: -10, xmax: 10, ymin: 0, ymax: 10 };
    const sq = squareWindow(asym, 400, 200); // half the height → smaller Y range
    const yCenter = (sq.ymin + sq.ymax) / 2;
    close(yCenter, 5);
    // Expected Y half-height: 10 * (200/400) = 5
    close(sq.ymax - sq.ymin, 10);
  });

  it('squareWindow scales Y to match canvas aspect', () => {
    const sq = squareWindow(w, 800, 200);
    // X range stays 20, Y should become 20 * (200/800) = 5 high.
    expect(sq.xmax - sq.xmin).toBe(20);
    close(sq.ymax - sq.ymin, 5);
  });
});

describe('format helpers', () => {
  it('niceStep picks 1/2/5 multiples', () => {
    expect(niceStep(10)).toBe(1);    // ~1.25 → 1
    expect(niceStep(20)).toBe(2);    // ~2.5 → 2
    expect(niceStep(100)).toBe(10);  // ~12.5 → 10
    expect(niceStep(1)).toBe(0.1);
  });
  it('fmtNum integers and decimals', () => {
    expect(fmtNum(5)).toBe('5');
    expect(fmtNum(-3)).toBe('-3');
    expect(fmtNum(0.1234567)).toBe('0.123');
  });
  it('formatResult handles edge cases', () => {
    expect(formatResult(NaN)).toBe('Error');
    expect(formatResult(Infinity)).toBe('+∞');
    expect(formatResult(-Infinity)).toBe('−∞');
    expect(formatResult(5)).toBe('5');
    expect(formatResult(1e15)).toMatch(/e/);
    expect(formatResult(1e-15)).toMatch(/e/);
  });
});
