// Pure-function statistics module: 1-variable stats, regression, normal
// distribution, list operations. No DOM access — main.ts handles wiring.

export function parseData(str: string): number[] {
  return str.split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
}

export function median(sortedArr: number[]): number {
  const n = sortedArr.length;
  if (n === 0) return NaN;
  return n % 2 === 0
    ? (sortedArr[n / 2 - 1]! + sortedArr[n / 2]!) / 2
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
  const sum = data.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const sorted = [...data].sort((a, b) => a - b);
  const ssd = data.reduce((a, b) => a + (b - mean) ** 2, 0);
  const sampleStdDev = n > 1 ? Math.sqrt(ssd / (n - 1)) : 0;
  const popStdDev = Math.sqrt(ssd / n);
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
  const sumSq = data.reduce((a, b) => a + b * b, 0);
  return {
    n, mean, sampleStdDev, popStdDev, sum, sumSq,
    median: med, q1, q3, iqr: q3 - q1,
    min: sorted[0]!, max: sorted[n - 1]!,
  };
}

export type RegressionType = 'linear' | 'quad' | 'exp';
export interface LinearReg { type: 'linear'; intercept: number; slope: number; r2: number; r: number }
export interface QuadReg { type: 'quad'; a: number; b: number; c: number }
export interface ExpReg { type: 'exp'; a: number; b: number }
export type RegressionResult = LinearReg | QuadReg | ExpReg;

export function linearRegression(xs: number[], ys: number[]): LinearReg | { error: string } {
  if (xs.length < 2 || xs.length !== ys.length) return { error: 'Mismatched data' };
  const n = xs.length;
  const sx = xs.reduce((a, v) => a + v, 0);
  const sy = ys.reduce((a, v) => a + v, 0);
  const sxy = xs.reduce((a, v, i) => a + v * ys[i]!, 0);
  const sxx = xs.reduce((a, v) => a + v * v, 0);
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return { error: 'LinReg requires variation in x-values' };
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const yMean = sy / n;
  const ssTot = ys.reduce((a, y) => a + (y - yMean) ** 2, 0);
  const ssRes = xs.reduce((a, v, i) => a + (ys[i]! - (intercept + slope * v)) ** 2, 0);
  let r2: number, r: number;
  if (ssTot < 1e-12) {
    r2 = ssRes < 1e-12 ? 1 : 0;
    r = 0;
  } else {
    r2 = 1 - ssRes / ssTot;
    r = Math.sign(slope) * Math.sqrt(Math.max(0, r2));
  }
  return { type: 'linear', intercept, slope, r2, r };
}

export function quadRegression(xs: number[], ys: number[]): QuadReg | { error: string } {
  if (xs.length < 3 || xs.length !== ys.length) return { error: 'Need ≥ 3 matched (x,y) pairs' };
  const n = xs.length;
  const s = [0, 0, 0, 0, 0];
  const sy = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    for (let p = 0; p <= 4; p++) s[p] += Math.pow(xs[i]!, p);
    sy[0] += ys[i]!;
    sy[1] += xs[i]! * ys[i]!;
    sy[2] += xs[i]! * xs[i]! * ys[i]!;
  }
  const A = [[n, s[1]!, s[2]!], [s[1]!, s[2]!, s[3]!], [s[2]!, s[3]!, s[4]!]];
  const B = [sy[0]!, sy[1]!, sy[2]!];
  const sol = gaussSolve(A, B);
  if (!sol) return { error: 'Could not solve' };
  return { type: 'quad', a: sol[2]!, b: sol[1]!, c: sol[0]! };
}

export function expRegression(xs: number[], ys: number[]): ExpReg | { error: string } {
  if (xs.length < 2 || xs.length !== ys.length) return { error: 'Mismatched data' };
  if (ys.some((y) => y <= 0)) return { error: 'ExpReg requires all y > 0' };
  const lnY = ys.map(Math.log);
  const n = xs.length;
  const sx = xs.reduce((a, v) => a + v, 0);
  const sly = lnY.reduce((a, v) => a + v, 0);
  const sxly = xs.reduce((a, v, i) => a + v * lnY[i]!, 0);
  const sxx = xs.reduce((a, v) => a + v * v, 0);
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return { error: 'ExpReg requires variation in x-values' };
  const b = (n * sxly - sx * sly) / denom;
  const a = Math.exp((sly - b * sx) / n);
  return { type: 'exp', a, b };
}

export function gaussSolve(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[maxRow]![col]!)) maxRow = r;
    [M[col], M[maxRow]] = [M[maxRow]!, M[col]!];
    if (Math.abs(M[col]![col]!) < 1e-12) return null;
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

// Abramowitz & Stegun 7.1.26 — max error ~1.5e-7. Plenty for a calculator.
export function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const result = 1 - poly * Math.exp(-x * x);
  return x >= 0 ? result : -result;
}

export function normalCDF(x: number, mu = 0, sigma = 1): number {
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.sqrt(2))));
}

// Beasley–Springer / Moro rational approximation for inverse normal CDF.
// Accurate to ~1e-9 across the full (0,1) range.
export function invNorm(p: number, mu = 0, sigma = 1): number {
  if (p <= 0 || p >= 1) return NaN;
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
  let s = 0;
  return data.map((x) => (s += x));
}

export function deltaList(data: number[]): number[] {
  return data.slice(1).map((x, i) => x - data[i]!);
}

export function sortAsc(data: number[]): number[] { return [...data].sort((a, b) => a - b); }
export function sortDesc(data: number[]): number[] { return [...data].sort((a, b) => b - a); }
