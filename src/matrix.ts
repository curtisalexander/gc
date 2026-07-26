// Matrix operations: add, subtract, multiply, transpose, determinant,
// inverse, trace, RREF, scalar multiply. All pure functions over number[][].

export type Matrix = number[][];

function dims(M: Matrix): [number, number] {
  return [M.length, M[0]?.length ?? 0];
}

function validate(M: Matrix, name = 'Matrix'): [number, number] {
  if (!Array.isArray(M) || M.length === 0 || !Array.isArray(M[0]) || M[0].length === 0)
    throw new Error(`${name} must be a nonempty matrix`);
  const cols = M[0].length;
  if (M.some(row => !Array.isArray(row) || row.length !== cols))
    throw new Error(`${name} must be rectangular`);
  if (M.some(row => row.some(value => !Number.isFinite(value))))
    throw new Error(`${name} must contain only finite numbers`);
  return [M.length, cols];
}

function finiteResult(M: Matrix): Matrix {
  validate(M, 'Result');
  return M;
}

function scaledProduct(factors: number[]): number {
  let sign = 1, mantissa = 1, exponent = 0;
  for (const factor of factors) {
    if (factor === 0) return 0;
    sign *= Math.sign(factor);
    const absolute = Math.abs(factor);
    const partExponent = Math.min(1023, Math.floor(Math.log2(absolute)));
    mantissa *= absolute / Math.pow(2, partExponent);
    exponent += partExponent;
    while (mantissa >= 2) { mantissa /= 2; exponent++; }
    while (mantissa < 1) { mantissa *= 2; exponent--; }
  }
  return sign * mantissa * Math.pow(2, exponent);
}

function scaledDot(row: number[], column: number[]): number {
  const rowScale = Math.max(...row.map(Math.abs));
  const columnScale = Math.max(...column.map(Math.abs));
  if (rowScale === 0 || columnScale === 0) return 0;
  let sum = 0, correction = 0;
  for (let i = 0; i < row.length; i++) {
    const value = (row[i]! / rowScale) * (column[i]! / columnScale);
    const next = sum + value;
    correction += Math.abs(sum) >= Math.abs(value)
      ? (sum - next) + value
      : (value - next) + sum;
    sum = next;
  }
  return scaledProduct([sum + correction, rowScale, columnScale]);
}

export function matAdd(A: Matrix, B: Matrix): Matrix {
  const ad = validate(A, 'A'), bd = validate(B, 'B');
  if (ad[0] !== bd[0] || ad[1] !== bd[1]) throw new Error('Dimension mismatch');
  return finiteResult(A.map((row, i) => row.map((x, j) => x + B[i]![j]!)));
}

export function matSub(A: Matrix, B: Matrix): Matrix {
  const ad = validate(A, 'A'), bd = validate(B, 'B');
  if (ad[0] !== bd[0] || ad[1] !== bd[1]) throw new Error('Dimension mismatch');
  return finiteResult(A.map((row, i) => row.map((x, j) => x - B[i]![j]!)));
}

export function matMul(A: Matrix, B: Matrix): Matrix {
  const [, aCols] = validate(A, 'A');
  const [bRows, bCols] = validate(B, 'B');
  if (aCols !== bRows) throw new Error('Dimension mismatch');
  const columns = Array.from({ length: bCols }, (_, j) => B.map(row => row[j]!));
  return finiteResult(A.map((row) => {
    const out = new Array<number>(bCols).fill(0);
    for (let j = 0; j < bCols; j++) {
      out[j] = scaledDot(row, columns[j]!);
    }
    return out;
  }));
}

export function matScalar(A: Matrix, k: number): Matrix {
  validate(A);
  if (!Number.isFinite(k)) throw new Error('Scalar must be finite');
  return finiteResult(A.map((row) => row.map((x) => x * k)));
}

export function matTrans(A: Matrix): Matrix {
  validate(A);
  return A[0]!.map((_, i) => A.map((row) => row[i]!));
}

export function matTrace(A: Matrix): number {
  const [rows, cols] = validate(A);
  if (rows !== cols) throw new Error('Not square');
  const result = A.reduce((s, row, i) => s + row[i]!, 0);
  if (!Number.isFinite(result)) throw new Error('Result is outside the supported numeric range');
  return result;
}

export function matDet(M: Matrix): number {
  const [n, cols] = validate(M);
  if (n !== cols) throw new Error('Not square');
  const scales = M.map(row => Math.max(...row.map(Math.abs)));
  if (scales.some(scale => scale === 0)) return 0;
  const A = M.map((row, i) => row.map(value => value / scales[i]!));
  const factors = [...scales];
  let sign = 1;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r]![col]!) > Math.abs(A[pivot]![col]!)) pivot = r;
    if (A[pivot]![col] === 0) return 0;
    if (pivot !== col) { [A[col], A[pivot]] = [A[pivot]!, A[col]!]; sign = -sign; }
    const p = A[col]![col]!;
    factors.push(p);
    for (let r = col + 1; r < n; r++) {
      const factor = A[r]![col]! / p;
      for (let c = col + 1; c < n; c++) A[r]![c]! -= factor * A[col]![c]!;
    }
  }
  const result = sign * scaledProduct(factors);
  if (!Number.isFinite(result)) throw new Error('Result is outside the supported numeric range');
  return result;
}

// Returns null if M is singular (within numerical tolerance).
export function matInv(M: Matrix): Matrix | null {
  const [n, cols] = validate(M);
  if (n !== cols) throw new Error('Not square');
  const scales = M.map(row => Math.max(...row.map(Math.abs)));
  if (scales.some(scale => scale === 0)) return null;
  const aug: number[][] = M.map((row, i) =>
    [...row.map(value => value / scales[i]!), ...Array(n).fill(0).map((_, j) => (i === j ? 1 / scales[i]! : 0))]);
  for (let col = 0; col < n; col++) {
    let max = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r]![col]!) > Math.abs(aug[max]![col]!)) max = r;
    }
    [aug[col], aug[max]] = [aug[max]!, aug[col]!];
    if (Math.abs(aug[col]![col]!) <= Number.EPSILON * n) return null;
    const pivot = aug[col]![col]!;
    for (let c = 0; c < 2 * n; c++) aug[col]![c]! /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = aug[r]![col]!;
      for (let c = 0; c < 2 * n; c++) aug[r]![c]! -= f * aug[col]![c]!;
    }
  }
  return finiteResult(aug.map((row) => row.slice(n)));
}

export function matRREF(M: Matrix): Matrix {
  validate(M);
  const out: Matrix = M.map((row) => {
    const scale = Math.max(...row.map(Math.abs));
    return scale === 0 ? [...row] : row.map(value => value / scale);
  });
  const rows = out.length;
  const cols = out[0]!.length;
  let lead = 0;
  for (let r = 0; r < rows; r++) {
    if (lead >= cols) break;
    let i = r, best = 0;
    for (let candidate = r; candidate < rows; candidate++) {
      const scale = Math.max(...out[candidate]!.map(Math.abs));
      const ratio = scale === 0 ? 0 : Math.abs(out[candidate]![lead]!) / scale;
      if (ratio > best) { best = ratio; i = candidate; }
    }
    if (best <= Number.EPSILON * Math.max(rows, cols)) { lead++; r--; continue; }
    [out[r], out[i]] = [out[i]!, out[r]!];
    const lv = out[r]![lead]!;
    out[r] = out[r]!.map((x) => x / lv);
    for (let j = 0; j < rows; j++) {
      if (j !== r) {
        const f = out[j]![lead]!;
        out[j] = out[j]!.map((x, k) => x - f * out[r]![k]!);
      }
    }
    lead++;
  }
  return finiteResult(out);
}

// Format a matrix as a left-padded text grid for display.
export function showMatrix(M: Matrix): string {
  validate(M);
  return M.map((row) => '[ ' + row.map((x) => {
    const n = Object.is(x, -0) ? 0 : x;
    // Six significant digits retain tiny nonzero values; use scientific form
    // outside the range where a compact decimal is readable.
    const magnitude = Math.abs(n);
    const text = n === 0 ? '0' : (magnitude < 1e-4 || magnitude >= 1e7)
      ? n.toExponential(5)
      : String(Number(n.toPrecision(6)));
    return text.padStart(10);
  }).join('  ') + ' ]').join('\n');
}
