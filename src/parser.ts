// Math expression parser shared by the graphing engine and the scientific
// calculator.
//
// Two entry points:
//   evalGraphExpr(expr, x)   — fast f(x) evaluator for plotting. Always radians.
//   evalCalcExpr(expr, opts) — calculator evaluator. Honors degree/radian mode,
//                              factorials, nCr/nPr, percent, sci notation.
//
// Both share the same normalization pipeline (implicit multiplication, ^ ->
// Math.pow, function-name remapping, constant substitution) so syntax stays
// consistent between the two views.

export type AngleMode = 'deg' | 'rad';
export interface CalcOpts { angleMode?: AngleMode }

const FUNC_NAMES = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'abs', 'log', 'ln', 'exp'] as const;
const FUNC_RE = FUNC_NAMES.join('|');

// Protect scientific notation from later transforms. Returns the rewritten
// string and a restore function.
function protectSci(e: string): [string, (s: string) => string] {
  const sci: string[] = [];
  const out = e.replace(/(\d+\.?\d*|\.\d+)[eE]([+-]?\d+)/g, (m) => {
    sci.push(m);
    return `§SCI${sci.length - 1}§`;
  });
  const restore = (s: string) => s.replace(/§SCI(\d+)§/g, (_, i) => sci[+i]!);
  return [out, restore];
}

// Insert explicit `*` for the implicit-multiplication patterns users expect:
// 2x, 2(x), )(, )2, )x, 2sin(x), pi*x, xx etc.
function insertImplicitMul(e: string): string {
  e = e.replace(/(\d)(\()/g, '$1*$2');
  e = e.replace(/(\))(\d)/g, '$1*$2');
  e = e.replace(/(\))(\()/g, '$1*$2');
  e = e.replace(new RegExp(`(\\d)(pi|e|x|${FUNC_RE})\\b`, 'g'), '$1*$2');
  e = e.replace(new RegExp(`\\)(pi|e|x|${FUNC_RE})\\b`, 'g'), ')*$1');
  e = e.replace(new RegExp(`\\b(pi|x)(pi|e|x|${FUNC_RE}|\\d|\\()`, 'g'), '$1*$2');
  // e-prefix implicit mul. Use lookahead with strict word-boundary on the
  // following identifier so we don't mangle `exp(`, `e^x`, etc. — the bare
  // `e` constant has to be followed by a *complete* token.
  e = e.replace(/\be(?=(?:pi|x|e)\b)/g, 'e*');
  e = e.replace(new RegExp(`\\be(?=(?:${FUNC_RE})\\()`, 'g'), 'e*');
  e = e.replace(/\be(?=[\d(])/g, 'e*');
  // xx -> x*x. Loop until stable so that xxx -> x*x*x.
  let prev: string;
  do {
    prev = e;
    e = e.replace(/\bx(x|pi|e)\b/g, 'x*$1');
  } while (e !== prev);
  return e;
}

// Convert ^ operator into Math.pow() with right-associativity. Critical so
// `-3^2` evaluates to -9 (TI-style) rather than tripping on JS's `**` rules
// for unary minus.
export function convertPowers(str: string): string {
  while (str.includes('^')) {
    const caretIdx = str.lastIndexOf('^');
    let leftStart: number;
    const leftEnd = caretIdx;
    let idx = caretIdx - 1;
    if (idx < 0) throw new Error('No left operand for ^');
    if (str[idx] === ')') {
      let depth = 1; idx--;
      while (idx >= 0 && depth > 0) {
        if (str[idx] === ')') depth++;
        else if (str[idx] === '(') depth--;
        if (depth === 0) break;
        idx--;
      }
      if (depth !== 0) throw new Error('Unbalanced parens in ^');
      let nameStart = idx - 1;
      while (nameStart >= 0 && /[a-zA-Z0-9_.]/.test(str[nameStart]!)) nameStart--;
      leftStart = nameStart + 1;
    } else {
      while (idx >= 0) {
        const c = str[idx]!;
        if (/[a-zA-Z0-9_.]/.test(c)) { idx--; continue; }
        if (c === '§') {
          idx--;
          while (idx >= 0 && str[idx] !== '§') idx--;
          if (idx < 0) break;
          idx--;
          continue;
        }
        break;
      }
      leftStart = idx + 1;
    }
    if (leftStart >= leftEnd) throw new Error('Empty left operand for ^');
    const rightCaret = caretIdx + 1;
    let rightEnd = rightCaret;
    if (str[rightEnd] === '+' || str[rightEnd] === '-') rightEnd++;
    if (rightEnd >= str.length) throw new Error('No right operand for ^');
    if (str[rightEnd] === '(') {
      let depth = 1; rightEnd++;
      while (rightEnd < str.length && depth > 0) {
        if (str[rightEnd] === '(') depth++;
        else if (str[rightEnd] === ')') depth--;
        rightEnd++;
      }
      if (depth !== 0) throw new Error('Unbalanced parens in ^ right');
    } else {
      while (rightEnd < str.length) {
        const c = str[rightEnd]!;
        if (/[a-zA-Z0-9_.]/.test(c)) { rightEnd++; continue; }
        if (c === '§') {
          rightEnd++;
          while (rightEnd < str.length && str[rightEnd] !== '§') rightEnd++;
          if (rightEnd < str.length) rightEnd++;
          continue;
        }
        break;
      }
      if (rightEnd < str.length && str[rightEnd] === '(') {
        let depth = 1; rightEnd++;
        while (rightEnd < str.length && depth > 0) {
          if (str[rightEnd] === '(') depth++;
          else if (str[rightEnd] === ')') depth--;
          rightEnd++;
        }
        if (depth !== 0) throw new Error('Unbalanced parens in ^ right');
      }
    }
    const left = str.substring(leftStart, leftEnd);
    const right = str.substring(rightCaret, rightEnd);
    str = str.substring(0, leftStart) + 'Math.pow(' + left + ',' + right + ')' + str.substring(rightEnd);
  }
  return str;
}

// Walk str, find all `funcName(args, ...)` calls with proper paren matching,
// and replace them with reducer(numericArgs).
export function replaceFunc(
  str: string,
  funcName: string,
  reducer: (args: number[]) => string,
  evalArg: (s: string) => number,
): string {
  const pattern = new RegExp('\\b' + funcName + '\\(', 'g');
  let result = '';
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(str)) !== null) {
    const start = m.index;
    let i = pattern.lastIndex;
    let depth = 1;
    const args: string[] = [];
    let argStart = i;
    while (i < str.length && depth > 0) {
      const c = str[i];
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) { args.push(str.substring(argStart, i)); break; }
      } else if (c === ',' && depth === 1) {
        args.push(str.substring(argStart, i));
        argStart = i + 1;
      }
      i++;
    }
    if (depth !== 0) { result += str.substring(lastIdx, start); lastIdx = start; continue; }
    const nums = args.map((a) => evalArg(a));
    result += str.substring(lastIdx, start) + reducer(nums);
    lastIdx = i + 1;
    pattern.lastIndex = lastIdx;
  }
  result += str.substring(lastIdx);
  return result;
}

export function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) return NaN;
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}
export function comb(n: number, r: number): number {
  if (r < 0 || r > n) return 0;
  return factorial(n) / (factorial(r) * factorial(n - r));
}
export function perm(n: number, r: number): number {
  if (r < 0 || r > n) return 0;
  return factorial(n) / factorial(n - r);
}

// Resolve all factorials in the string. Handles both `5!` and `(2+3)!` forms,
// recursing through the supplied evalArg for parenthesized sub-expressions.
function resolveFactorials(e: string, evalArg: (s: string) => number): string {
  // Reject `!!` rather than silently computing (n!)! — that produces wildly
  // wrong-looking huge numbers (5!! → 120! ≈ 6.7e198) instead of the math
  // double-factorial 5*3*1 = 15.
  if (/!\s*!/.test(e)) throw new Error('Double factorial not supported');
  let changed = true;
  while (changed) {
    changed = false;
    const newE = e.replace(/(\d+(?:\.\d+)?)\s*!/g, (_, n) => {
      changed = true;
      return String(factorial(+n));
    });
    e = newE;
    const parenMatch = e.match(/\)\s*!/);
    if (parenMatch && parenMatch.index !== undefined) {
      const closeIdx = parenMatch.index;
      const bangIdx = closeIdx + parenMatch[0].length - 1;
      let depth = 1;
      let openIdx = closeIdx - 1;
      while (openIdx >= 0 && depth > 0) {
        if (e[openIdx] === ')') depth++;
        else if (e[openIdx] === '(') depth--;
        if (depth === 0) break;
        openIdx--;
      }
      if (depth === 0) {
        const inner = e.substring(openIdx + 1, closeIdx);
        try {
          const val = evalArg(inner);
          e = e.substring(0, openIdx) + String(factorial(val)) + e.substring(bangIdx + 1);
          changed = true;
        } catch { /* leave it; later eval will throw */ }
      }
    }
  }
  return e;
}

// Collapse adjacent unary +/- so users can type `5--3` or `2+-3` and get the
// expected JS-friendly form (`5+3`, `2-3`).
function collapseUnary(e: string): string {
  let prev: string;
  do {
    prev = e;
    e = e.replace(/--/g, '+').replace(/\+\+/g, '+').replace(/-\+/g, '-').replace(/\+-/g, '-');
  } while (e !== prev);
  if (e[0] === '+') e = e.substring(1);
  return e;
}

interface NameMap { [name: string]: string }

function mapNamesAndConsts(e: string, trigMap: NameMap): string {
  for (const [name, repl] of Object.entries(trigMap)) {
    e = e.replace(new RegExp(`\\b${name}\\(`, 'g'), repl);
  }
  e = e.replace(/\bsqrt\(/g, 'Math.sqrt(');
  e = e.replace(/\babs\(/g, 'Math.abs(');
  e = e.replace(/\blog\(/g, 'Math.log10(');
  e = e.replace(/\bln\(/g, 'Math.log(');
  e = e.replace(/\bexp\(/g, 'Math.exp(');
  e = e.replace(/\bpi\b/g, '(Math.PI)');
  // Replace bare `e` only when not part of an identifier or sci marker.
  e = e.replace(/(^|[^a-zA-Z0-9_§])e(?![a-zA-Z0-9_])/g, '$1(Math.E)');
  return e;
}

// Evaluator for f(x) used by the graphing view. Always radians.
// Returns NaN on parse / runtime error so the caller can simply skip the point.
export function evalGraphExpr(expr: string, x: number): number {
  try {
    let e = (expr || '').trim();
    if (!e) return NaN;
    let restore: (s: string) => string;
    [e, restore] = protectSci(e);
    e = insertImplicitMul(e);
    e = convertPowers(e);
    e = mapNamesAndConsts(e, {
      asin: 'Math.asin(', acos: 'Math.acos(', atan: 'Math.atan(',
      sin: 'Math.sin(', cos: 'Math.cos(', tan: 'Math.tan(',
    });
    e = e.replace(/\bx\b/g, `(${x})`);
    e = restore(e);
    return Function('"use strict"; return (' + e + ')')() as number;
  } catch {
    return NaN;
  }
}

// Evaluator for the scientific calculator. Supports degree/radian mode,
// factorials, nCr/nPr, percent.
export function evalCalcExpr(expr: string, opts: CalcOpts = {}): number {
  const angleMode: AngleMode = opts.angleMode || 'rad';
  let e = (expr || '').trim();
  if (!e) throw new Error('empty');
  let restore: (s: string) => string;
  [e, restore] = protectSci(e);
  e = collapseUnary(e);
  e = insertImplicitMul(e);
  e = e.replace(/(\d)(nCr|nPr)\b/g, '$1*$2');
  e = resolveFactorials(e, (s) => evalCalcExpr(s, opts));
  e = replaceFunc(e, 'nCr', (a) => {
    if (a.length !== 2) throw new Error('nCr needs 2 args');
    return String(comb(a[0]!, a[1]!));
  }, (s) => evalCalcExpr(s, opts));
  e = replaceFunc(e, 'nPr', (a) => {
    if (a.length !== 2) throw new Error('nPr needs 2 args');
    return String(perm(a[0]!, a[1]!));
  }, (s) => evalCalcExpr(s, opts));
  e = convertPowers(e);
  const deg = angleMode === 'deg';
  e = mapNamesAndConsts(e, {
    asin: deg ? '__ASIND__(' : 'Math.asin(',
    acos: deg ? '__ACOSD__(' : 'Math.acos(',
    atan: deg ? '__ATAND__(' : 'Math.atan(',
    sin: deg ? '__SIND__(' : 'Math.sin(',
    cos: deg ? '__COSD__(' : 'Math.cos(',
    tan: deg ? '__TAND__(' : 'Math.tan(',
  });
  e = e.replace(/%/g, '/100');
  e = restore(e);
  const ctx = {
    Math,
    __SIND__: (x: number) => Math.sin(x * Math.PI / 180),
    __COSD__: (x: number) => Math.cos(x * Math.PI / 180),
    __TAND__: (x: number) => Math.tan(x * Math.PI / 180),
    __ASIND__: (x: number) => Math.asin(x) * 180 / Math.PI,
    __ACOSD__: (x: number) => Math.acos(x) * 180 / Math.PI,
    __ATAND__: (x: number) => Math.atan(x) * 180 / Math.PI,
  };
  const fn = new Function(...Object.keys(ctx), '"use strict"; return (' + e + ')');
  const raw = fn(...Object.values(ctx)) as number;
  // Snap float-precision noise to zero so e.g. cos(90°) returns 0, not 6e-17.
  // Threshold sits well below any "real" intentional small number a user
  // would type into a calculator.
  return Number.isFinite(raw) && Math.abs(raw) < 1e-13 ? 0 : raw;
}
