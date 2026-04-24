import { describe, it, expect } from 'vitest';
import {
  matAdd, matSub, matMul, matScalar, matTrans, matTrace,
  matDet, matInv, matRREF, showMatrix, type Matrix,
} from '../src/matrix.js';

const closeMat = (A: Matrix, B: Matrix, tol = 1e-9) => {
  expect(A.length).toBe(B.length);
  for (let i = 0; i < A.length; i++) {
    expect(A[i]!.length).toBe(B[i]!.length);
    for (let j = 0; j < A[i]!.length; j++) {
      expect(Math.abs(A[i]![j]! - B[i]![j]!)).toBeLessThan(tol);
    }
  }
};

describe('matAdd / matSub', () => {
  it('2x2 add', () => {
    expect(matAdd([[1, 2], [3, 4]], [[5, 6], [7, 8]])).toEqual([[6, 8], [10, 12]]);
  });
  it('2x2 sub', () => {
    expect(matSub([[5, 6], [7, 8]], [[1, 2], [3, 4]])).toEqual([[4, 4], [4, 4]]);
  });
  it('dim mismatch throws', () => {
    expect(() => matAdd([[1, 2]], [[1], [2]])).toThrow();
  });
});

describe('matMul', () => {
  it('2x2 * 2x2', () => {
    expect(matMul([[1, 2], [3, 4]], [[5, 6], [7, 8]])).toEqual([[19, 22], [43, 50]]);
  });
  it('identity', () => {
    const I = [[1, 0], [0, 1]];
    const A: Matrix = [[2, 3], [4, 5]];
    expect(matMul(I, A)).toEqual(A);
    expect(matMul(A, I)).toEqual(A);
  });
  it('non-square 2x3 * 3x2', () => {
    const A: Matrix = [[1, 2, 3], [4, 5, 6]];
    const B: Matrix = [[7, 8], [9, 10], [11, 12]];
    expect(matMul(A, B)).toEqual([[58, 64], [139, 154]]);
  });
  it('dim mismatch throws', () => {
    expect(() => matMul([[1, 2]], [[1, 2]])).toThrow();
  });
});

describe('matScalar', () => {
  it('scales entries', () => {
    expect(matScalar([[1, 2], [3, 4]], 3)).toEqual([[3, 6], [9, 12]]);
  });
});

describe('matTrans / matTrace', () => {
  it('transpose 2x3', () => {
    expect(matTrans([[1, 2, 3], [4, 5, 6]])).toEqual([[1, 4], [2, 5], [3, 6]]);
  });
  it('trace', () => {
    expect(matTrace([[1, 2], [3, 4]])).toBe(5);
    expect(matTrace([[1, 2, 3], [4, 5, 6], [7, 8, 9]])).toBe(15);
  });
  it('trace throws on non-square', () => {
    expect(() => matTrace([[1, 2, 3]])).toThrow();
  });
});

describe('matDet', () => {
  it('1x1', () => expect(matDet([[7]])).toBe(7));
  it('2x2', () => expect(matDet([[1, 2], [3, 4]])).toBe(-2));
  it('3x3', () => {
    // Well-known: det([[6,1,1],[4,-2,5],[2,8,7]]) = -306
    expect(matDet([[6, 1, 1], [4, -2, 5], [2, 8, 7]])).toBe(-306);
  });
  it('singular is 0', () => {
    expect(matDet([[1, 2], [2, 4]])).toBe(0);
  });
});

describe('matInv', () => {
  it('inverts 2x2', () => {
    const A: Matrix = [[4, 7], [2, 6]];
    const inv = matInv(A)!;
    closeMat(inv, [[0.6, -0.7], [-0.2, 0.4]]);
  });
  it('A * A⁻¹ = I for 3x3', () => {
    const A: Matrix = [[1, 2, 3], [0, 1, 4], [5, 6, 0]];
    const inv = matInv(A)!;
    expect(inv).not.toBeNull();
    const I = matMul(A, inv);
    closeMat(I, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], 1e-9);
  });
  it('returns null for singular', () => {
    expect(matInv([[1, 2], [2, 4]])).toBeNull();
  });
});

describe('matRREF', () => {
  it('already identity stays identity', () => {
    expect(matRREF([[1, 0], [0, 1]])).toEqual([[1, 0], [0, 1]]);
  });
  it('reduces a simple system', () => {
    // [[1,2,3],[2,4,6]] should reduce to [[1,2,3],[0,0,0]]
    closeMat(matRREF([[1, 2, 3], [2, 4, 6]]), [[1, 2, 3], [0, 0, 0]]);
  });
  it('reduces a 3x4 augmented', () => {
    // From x+y+z=6, 2y+5z=-4, 2x+5y-z=27 → rref = I|sol
    const M: Matrix = [[1, 1, 1, 6], [0, 2, 5, -4], [2, 5, -1, 27]];
    const r = matRREF(M);
    closeMat(r, [[1, 0, 0, 5], [0, 1, 0, 3], [0, 0, 1, -2]]);
  });
  it('does not mutate input', () => {
    const M: Matrix = [[1, 2], [3, 4]];
    const snap = JSON.parse(JSON.stringify(M));
    matRREF(M);
    expect(M).toEqual(snap);
  });
});

describe('showMatrix', () => {
  it('formats with padding', () => {
    const s = showMatrix([[1, 2], [3, 4]]);
    expect(s).toContain('[');
    expect(s).toContain(']');
    expect(s.split('\n').length).toBe(2);
  });
  it('normalizes -0 to 0', () => {
    const s = showMatrix([[-0, 1]]);
    expect(s).not.toContain('-0');
  });
});
