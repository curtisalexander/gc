// Matrix operations: add, subtract, multiply, transpose, determinant,
// inverse, trace, RREF, scalar multiply. All pure functions over number[][].

export type Matrix = number[][];

function dims(M: Matrix): [number, number] {
  return [M.length, M[0]?.length ?? 0];
}

export function matAdd(A: Matrix, B: Matrix): Matrix {
  if (A.length !== B.length || A[0]!.length !== B[0]!.length) throw new Error('Dimension mismatch');
  return A.map((row, i) => row.map((x, j) => x + B[i]![j]!));
}

export function matSub(A: Matrix, B: Matrix): Matrix {
  if (A.length !== B.length || A[0]!.length !== B[0]!.length) throw new Error('Dimension mismatch');
  return A.map((row, i) => row.map((x, j) => x - B[i]![j]!));
}

export function matMul(A: Matrix, B: Matrix): Matrix {
  if (A[0]!.length !== B.length) throw new Error('Dimension mismatch');
  const [, aCols] = dims(A);
  const [, bCols] = dims(B);
  return A.map((row) => {
    const out = new Array<number>(bCols).fill(0);
    for (let j = 0; j < bCols; j++) {
      let s = 0;
      for (let k = 0; k < aCols; k++) s += row[k]! * B[k]![j]!;
      out[j] = s;
    }
    return out;
  });
}

export function matScalar(A: Matrix, k: number): Matrix {
  return A.map((row) => row.map((x) => x * k));
}

export function matTrans(A: Matrix): Matrix {
  return A[0]!.map((_, i) => A.map((row) => row[i]!));
}

export function matTrace(A: Matrix): number {
  if (A.length !== A[0]!.length) throw new Error('Not square');
  return A.reduce((s, row, i) => s + row[i]!, 0);
}

export function matDet(M: Matrix): number {
  const n = M.length;
  if (n !== M[0]!.length) throw new Error('Not square');
  if (n === 1) return M[0]![0]!;
  if (n === 2) return M[0]![0]! * M[1]![1]! - M[0]![1]! * M[1]![0]!;
  let det = 0;
  for (let j = 0; j < n; j++) {
    const sub = M.slice(1).map((row) => row.filter((_, c) => c !== j));
    det += (j % 2 === 0 ? 1 : -1) * M[0]![j]! * matDet(sub);
  }
  return det;
}

// Returns null if M is singular (within numerical tolerance).
export function matInv(M: Matrix): Matrix | null {
  const n = M.length;
  if (n !== M[0]!.length) throw new Error('Not square');
  const aug: number[][] = M.map((row, i) =>
    [...row, ...Array(n).fill(0).map((_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let max = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r]![col]!) > Math.abs(aug[max]![col]!)) max = r;
    }
    [aug[col], aug[max]] = [aug[max]!, aug[col]!];
    if (Math.abs(aug[col]![col]!) < 1e-12) return null;
    const pivot = aug[col]![col]!;
    for (let c = 0; c < 2 * n; c++) aug[col]![c]! /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = aug[r]![col]!;
      for (let c = 0; c < 2 * n; c++) aug[r]![c]! -= f * aug[col]![c]!;
    }
  }
  return aug.map((row) => row.slice(n));
}

export function matRREF(M: Matrix): Matrix {
  const out: Matrix = M.map((r) => [...r]);
  const rows = out.length;
  const cols = out[0]!.length;
  let lead = 0;
  for (let r = 0; r < rows; r++) {
    if (lead >= cols) break;
    let i = r;
    while (Math.abs(out[i]![lead]!) < 1e-12) {
      i++;
      if (i === rows) {
        i = r;
        lead++;
        if (lead === cols) return out;
      }
    }
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
  return out;
}

// Format a matrix as a left-padded text grid for display.
export function showMatrix(M: Matrix): string {
  return M.map((row) => '[ ' + row.map((x) => {
    let n = parseFloat(x.toFixed(6));
    if (Object.is(n, -0)) n = 0;
    return String(n).padStart(10);
  }).join('  ') + ' ]').join('\n');
}
