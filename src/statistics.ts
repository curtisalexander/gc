// Pure-function statistics module: 1-variable stats, regression, normal
// distribution, list operations. No DOM access — main.ts handles wiring.

export function parseData(str: string): number[] {
  const tokens = str.trim() === '' ? [] : str.trim().split(/[\s,;]+/).filter(Boolean);
  return tokens.map((token, i) => {
    const value = Number(token);
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid numeric token ${i + 1}: "${token}"`);
    }
    return value;
  });
}

function compensatedSum(values: Iterable<number>): number {
  let sum = 0, correction = 0;
  for (const value of values) {
    const next = sum + value;
    correction += Math.abs(sum) >= Math.abs(value)
      ? (sum - next) + value
      : (value - next) + sum;
    sum = next;
  }
  return sum + correction;
}

function safeMean(values: number[]): number {
  const scale = Math.max(...values.map(Math.abs));
  if (scale === 0) return 0;
  return compensatedSum(values.map(value => value / scale)) / values.length * scale;
}

function scaledSum(values: number[]): number {
  const scale = Math.max(...values.map(Math.abs));
  if (scale === 0) return 0;
  return compensatedSum(values.map(value => value / scale)) * scale;
}

function finiteMatched(xs: number[], ys: number[], minimum: number): string | null {
  if (xs.length < minimum || xs.length !== ys.length) return 'Mismatched data';
  if (![...xs, ...ys].every(Number.isFinite)) return 'Regression data must be finite';
  return null;
}

export function median(sortedArr: number[]): number {
  const n = sortedArr.length;
  if (n === 0) return NaN;
  return n % 2 === 0
    ? sortedArr[n / 2 - 1]! / 2 + sortedArr[n / 2]! / 2
    : sortedArr[Math.floor(n / 2)]!;
}

export interface OneVarStats {
  n: number;
  mean: number;
  sampleStdDev: number;     // Sx (n-1 denominator)
  popStdDev: number;        // σx (n denominator)
  sum: number;
  sumSq: number;
  median: number;
  q1: number;
  q3: number;
  iqr: number;
  min: number;
  max: number;
}

export function oneVarStats(data: number[]): OneVarStats | null {
  const n = data.length;
  if (n === 0) return null;
  if (!data.every(Number.isFinite)) throw new Error('Statistics data must contain only finite numbers');
  const scale = Math.max(...data.map(Math.abs)) || 1;
  const normalized = data.map(value => value / scale);
  const sum = scaledSum(data);
  // Welford on scaled values avoids overflow as well as cancellation.
  let runningMean = 0, ssd = 0;
  for (let i = 0; i < n; i++) {
    const delta = normalized[i]! - runningMean;
    runningMean += delta / (i + 1);
    ssd += delta * (normalized[i]! - runningMean);
  }
  const mean = sum / n;
  const sorted = [...data].sort((a, b) => a - b);
  const sampleStdDev = n > 1 ? Math.sqrt(Math.max(0, ssd) / (n - 1)) * scale : NaN;
  const popStdDev = Math.sqrt(ssd / n) * scale;
  const med = median(sorted);
  // Standard exclusive Q1/Q3: drop the overall median when n is odd.
  // For n=1 there's no lower/upper half — collapse quartiles to the single
  // value so the display shows numbers instead of dashes.
  let q1: number, q3: number;
  if (n === 1) {
    q1 = q3 = sorted[0]!;
  } else {
    const lowerHalf = n % 2 === 0 ? sorted.slice(0, n / 2) : sorted.slice(0, Math.floor(n / 2));
    const upperHalf = n % 2 === 0 ? sorted.slice(n / 2) : sorted.slice(Math.ceil(n / 2));
    q1 = median(lowerHalf);
    q3 = median(upperHalf);
  }
  const sumSq = compensatedSum(normalized.map((b) => b * b)) * scale * scale;
  const iqr = q3 - q1;
  if (![sum, mean, popStdDev, sumSq, q1, q3, iqr].every(Number.isFinite)
      || (n > 1 && !Number.isFinite(sampleStdDev))) {
    throw new Error('Statistics result is outside the supported numeric range');
  }
  return {
    n, mean, sampleStdDev, popStdDev, sum, sumSq,
    median: med, q1, q3, iqr,
    min: sorted[0]!, max: sorted[n - 1]!,
  };
}

export type RegressionType = 'linear' | 'quad' | 'exp';
export interface LinearReg { type: 'linear'; intercept: number; slope: number; r2: number; r: number }
export interface QuadReg { type: 'quad'; a: number; b: number; c: number }
export interface ExpReg { type: 'exp'; a: number; b: number }
export type RegressionResult = LinearReg | QuadReg | ExpReg;

export function linearRegression(xs: number[], ys: number[]): LinearReg | { error: string } {
  const invalid = finiteMatched(xs, ys, 2);
  if (invalid) return { error: invalid };
  const xMean = safeMean(xs), yMean = safeMean(ys);
  const rawDx = xs.map(x => x - xMean), rawDy = ys.map(y => y - yMean);
  const xScale = Math.max(...rawDx.map(Math.abs)), yScale = Math.max(...rawDy.map(Math.abs)) || 1;
  if (!Number.isFinite(xScale) || xScale === 0) return { error: 'LinReg requires finite variation in x-values' };
  const dx = rawDx.map(x => x / xScale), dy = rawDy.map(y => y / yScale);
  const sxx = compensatedSum(dx.map(x => x * x));
  const normalizedSlope = compensatedSum(dx.map((x, i) => x * dy[i]!)) / sxx;
  const slope = normalizedSlope * yScale / xScale;
  const intercept = yMean - normalizedSlope * yScale * (xMean / xScale);
  const ssTot = compensatedSum(dy.map(y => y * y));
  const ssRes = compensatedSum(dx.map((x, i) => (dy[i]! - normalizedSlope * x) ** 2));
  let r2: number, r: number;
  if (ssTot === 0) {
    r2 = ssRes === 0 ? 1 : 0;
    r = 0;
  } else {
    r2 = 1 - ssRes / ssTot;
    r = Math.sign(slope) * Math.sqrt(Math.max(0, r2));
  }
  if (![intercept, slope, r2, r].every(Number.isFinite)) return { error: 'Regression result is outside the supported numeric range' };
  return { type: 'linear', intercept, slope, r2, r };
}

export function quadRegression(xs: number[], ys: number[]): QuadReg | { error: string } {
  const invalid = finiteMatched(xs, ys, 3);
  if (invalid) return { error: 'Need ≥ 3 matched finite (x,y) pairs' };
  const n = xs.length;
  const center = safeMean(xs);
  const scale = Math.max(...xs.map(x => Math.abs(x - center)));
  if (scale === 0) return { error: 'QuadReg requires at least three distinct x-values' };
  const z = xs.map(x => (x - center) / scale);
  // Modified Gram-Schmidt QR on [1,z,z²], avoiding ill-conditioned normal equations.
  const columns = [z.map(() => 1), z, z.map(v => v * v)];
  const q: number[][] = [], R = Array.from({ length: 3 }, () => [0, 0, 0]);
  for (let j = 0; j < 3; j++) {
    let v = [...columns[j]!];
    for (let i = 0; i < j; i++) {
      R[i]![j] = compensatedSum(q[i]!.map((x, k) => x * v[k]!));
      v = v.map((x, k) => x - R[i]![j]! * q[i]![k]!);
    }
    R[j]![j] = Math.hypot(...v);
    if (R[j]![j]! <= Number.EPSILON * n * 8) return { error: 'QuadReg requires at least three distinct x-values' };
    q[j] = v.map(x => x / R[j]![j]!);
  }
  const rhs = q.map(col => compensatedSum(col.map((x, i) => x * ys[i]!)));
  const coef = [0, 0, 0];
  for (let i = 2; i >= 0; i--) coef[i] = (rhs[i]! - compensatedSum(coef.slice(i + 1).map((x, k) => R[i]![i + 1 + k]! * x))) / R[i]![i]!;
  const a = coef[2]! / (scale * scale);
  const b = coef[1]! / scale - 2 * a * center;
  const c = coef[0]! - coef[1]! * center / scale + a * center * center;
  if (![a, b, c].every(Number.isFinite)) return { error: 'Regression result is outside the supported numeric range' };
  return { type: 'quad', a, b, c };
}

export function expRegression(xs: number[], ys: number[]): ExpReg | { error: string } {
  const invalid = finiteMatched(xs, ys, 2);
  if (invalid) return { error: invalid };
  if (ys.some((y) => y <= 0)) return { error: 'ExpReg requires all y > 0' };
  const lnY = ys.map(Math.log);
  const xm = safeMean(xs), lm = safeMean(lnY);
  const rawDx = xs.map(x => x - xm);
  const xScale = Math.max(...rawDx.map(Math.abs));
  if (!Number.isFinite(xScale) || xScale === 0) return { error: 'ExpReg requires finite variation in x-values' };
  const dx = rawDx.map(x => x / xScale);
  const normalizedSlope = compensatedSum(dx.map((x, i) => x * (lnY[i]! - lm))) / compensatedSum(dx.map(x => x * x));
  const b = normalizedSlope / xScale;
  const a = Math.exp(lm - normalizedSlope * (xm / xScale));
  if (![a, b].every(Number.isFinite)) return { error: 'Regression result is outside the supported numeric range' };
  return { type: 'exp', a, b };
}

export function gaussSolve(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  if (n === 0 || b.length !== n || A.some(row => row.length !== n) ||
      A.some(row => row.some(value => !Number.isFinite(value))) || !b.every(Number.isFinite)) {
    throw new Error('Solve requires a nonempty square finite matrix and matched finite vector');
  }
  const scales = A.map(row => Math.max(...row.map(Math.abs)));
  if (scales.some(scale => scale === 0)) return null;
  const M = A.map((row, i) => [...row.map(value => value / scales[i]!), b[i]! / scales[i]!]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r]![col]!) > Math.abs(M[maxRow]![col]!)) maxRow = r;
    }
    [M[col], M[maxRow]] = [M[maxRow]!, M[col]!];
    if (Math.abs(M[col]![col]!) <= Number.EPSILON * n) return null;
    for (let r = col + 1; r < n; r++) {
      const f = M[r]![col]! / M[col]![col]!;
      for (let c = col; c <= n; c++) M[r]![c]! -= f * M[col]![c]!;
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i]![n]!;
    for (let j = i + 1; j < n; j++) x[i] -= M[i]![j]! * x[j];
    x[i] /= M[i]![i]!;
  }
  return x;
}

// Abramowitz & Stegun 7.1.26 — max error ~1.5e-7. The complementary form
// avoids subtracting from 1 when evaluating small tail probabilities.
function erfcApprox(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const tail = poly * Math.exp(-x * x);
  return x >= 0 ? tail : 2 - tail;
}

export function erf(x: number): number {
  return 1 - erfcApprox(x);
}

function standardize(x: number, mu: number, sigma: number): number {
  const difference = x - mu;
  return Number.isFinite(difference) ? difference / sigma : x / sigma - mu / sigma;
}

export function normalCDF(x: number, mu = 0, sigma = 1): number {
  if (![x, mu, sigma].every(Number.isFinite) || sigma <= 0) return NaN;
  const z = standardize(x, mu, sigma);
  return z < 0 ? 0.5 * erfcApprox(-z / Math.sqrt(2)) : 1 - 0.5 * erfcApprox(z / Math.sqrt(2));
}

export function normalIntervalProbability(lo: number, hi: number, mu = 0, sigma = 1): number {
  if (![lo, hi, mu, sigma].every(Number.isFinite) || sigma <= 0 || lo > hi) return NaN;
  const zLo = standardize(lo, mu, sigma), zHi = standardize(hi, mu, sigma);
  if (zLo >= 0) return 0.5 * (erfcApprox(zLo / Math.sqrt(2)) - erfcApprox(zHi / Math.sqrt(2)));
  if (zHi <= 0) return 0.5 * (erfcApprox(-zHi / Math.sqrt(2)) - erfcApprox(-zLo / Math.sqrt(2)));
  return normalCDF(hi, mu, sigma) - normalCDF(lo, mu, sigma);
}

// Beasley–Springer / Moro rational approximation for inverse normal CDF.
// Accurate to ~1e-9 across the full (0,1) range.
export function invNorm(p: number, mu = 0, sigma = 1): number {
  if (![p, mu, sigma].every(Number.isFinite) || sigma <= 0 || p <= 0 || p >= 1) return NaN;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pLow = 0.02425, pHigh = 1 - pLow;
  let z: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    z = (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
        ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  } else if (p <= pHigh) {
    const q = p - 0.5, r = q * q;
    z = (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q /
        (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    z = -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
         ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  return mu + sigma * z;
}

export function cumSum(data: number[]): number[] {
  if (!data.every(Number.isFinite)) throw new Error('List must contain only finite numbers');
  let s = 0;
  return data.map((x) => {
    s += x;
    if (!Number.isFinite(s)) throw new Error('List result is outside the supported numeric range');
    return s;
  });
}

export function deltaList(data: number[]): number[] {
  if (!data.every(Number.isFinite)) throw new Error('List must contain only finite numbers');
  return data.slice(1).map((x, i) => {
    const delta = x - data[i]!;
    if (!Number.isFinite(delta)) throw new Error('List result is outside the supported numeric range');
    return delta;
  });
}

export function sortAsc(data: number[]): number[] {
  if (!data.every(Number.isFinite)) throw new Error('List must contain only finite numbers');
  return [...data].sort((a, b) => a - b);
}
export function sortDesc(data: number[]): number[] {
  if (!data.every(Number.isFinite)) throw new Error('List must contain only finite numbers');
  return [...data].sort((a, b) => b - a);
}
