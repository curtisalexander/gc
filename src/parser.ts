// Allowlisted expression parser shared by graphing and calculator views.
export type AngleMode = 'deg' | 'rad';
export interface CalcOpts { angleMode?: AngleMode }

const MAX_LENGTH = 4096;
const MAX_DEPTH = 100;
const UNARY_FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'cbrt', 'abs', 'log', 'ln', 'exp',
]);
const WORDS = [...UNARY_FUNCTIONS, 'nCr', 'nPr', 'pi', 'e', 'x']
  .sort((a, b) => b.length - a.length);

type TokenKind = 'number' | 'name' | 'op' | 'lparen' | 'rparen' | 'comma' | 'eof';
interface Token { kind: TokenKind; text: string; value?: number; start: number; end: number }

const tokenCache = new Map<string, Token[]>();

function tokenize(source: string): Token[] {
  if (source.length > MAX_LENGTH) throw new Error('Expression too long');
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i]!)) { i++; continue; }
    const start = i;
    const rest = source.slice(i);
    const number = rest.match(/^(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?/);
    if (number) {
      i += number[0].length;
      const value = Number(number[0]);
      if (!Number.isFinite(value)) throw new Error('Non-finite number');
      tokens.push({ kind: 'number', text: number[0], value, start, end: i });
      continue;
    }
    if (/[A-Za-z_]/.test(source[i]!)) {
      let end = i + 1;
      while (end < source.length && /[A-Za-z_]/.test(source[end]!)) end++;
      let word = source.slice(i, end);
      let offset = i;
      while (word) {
        const known = WORDS.find((candidate) => word.startsWith(candidate));
        if (!known) throw new Error(`Unknown identifier at ${offset}`);
        tokens.push({ kind: 'name', text: known, start: offset, end: offset + known.length });
        offset += known.length;
        word = word.slice(known.length);
      }
      i = end;
      continue;
    }
    const c = source[i++]!;
    if ('+-*/^!%'.includes(c)) tokens.push({ kind: 'op', text: c, start, end: i });
    else if (c === '(') tokens.push({ kind: 'lparen', text: c, start, end: i });
    else if (c === ')') tokens.push({ kind: 'rparen', text: c, start, end: i });
    else if (c === ',') tokens.push({ kind: 'comma', text: c, start, end: i });
    else throw new Error(`Unexpected character at ${start}`);
  }
  tokens.push({ kind: 'eof', text: '', start: source.length, end: source.length });
  return tokens;
}

function cachedTokens(source: string): Token[] {
  const cached = tokenCache.get(source);
  if (cached) return cached;
  const tokens = tokenize(source);
  if (tokenCache.size >= 64) tokenCache.delete(tokenCache.keys().next().value!);
  tokenCache.set(source, tokens);
  return tokens;
}

interface ParseConfig { graph: boolean; x: number; angleMode: AngleMode; validateOnly?: boolean }

function finiteOrNaN(value: number): number {
  return Number.isFinite(value) ? value : NaN;
}

class Parser {
  private index = 0;
  private depth = 0;
  constructor(private readonly tokens: Token[], private readonly config: ParseConfig) {}

  parse(): number {
    const result = this.sum();
    if (this.peek().kind !== 'eof') throw new Error('Unexpected token');
    // Domain errors are represented as NaN (for graph gaps and calculator
    // "Error" display); infinities/overflow are never accepted as results.
    if (result === Infinity || result === -Infinity) throw new Error('Non-finite result');
    return result;
  }

  private peek(): Token { return this.tokens[this.index]!; }
  private take(): Token { return this.tokens[this.index++]!; }
  private isOp(op: string): boolean { const t = this.peek(); return t.kind === 'op' && t.text === op; }

  private sum(): number {
    let value = this.product();
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.take().text;
      const rhs = this.product();
      value = finiteOrNaN(op === '+' ? value + rhs : value - rhs);
    }
    return value;
  }

  private product(): number {
    let value = this.unary();
    while (true) {
      if (this.isOp('*') || this.isOp('/')) {
        const op = this.take().text;
        const rhs = this.unary();
        value = finiteOrNaN(op === '*' ? value * rhs : value / rhs);
      } else if (this.startsImplicitPrimary()) {
        value = finiteOrNaN(value * this.unary());
      } else break;
    }
    return value;
  }

  // Unary signs bind less tightly than power: -3^2 is -(3^2).
  private unary(): number {
    if (this.isOp('+')) { this.take(); return +this.unary(); }
    if (this.isOp('-')) { this.take(); return -this.unary(); }
    return this.power();
  }

  private power(): number {
    const base = this.postfix();
    if (this.isOp('^')) {
      this.take();
      return finiteOrNaN(Math.pow(base, this.unary())); // unary permits 2^-2; recursion makes ^ right-associative
    }
    return base;
  }

  private postfix(): number {
    let value = this.primary();
    while (this.isOp('!') || this.isOp('%')) {
      const op = this.take().text;
      if (this.config.graph) throw new Error('Calculator-only postfix operator');
      if (op === '!') {
        if (this.isOp('!')) throw new Error('Double factorial not supported');
        value = finiteOrNaN(factorial(value));
      } else value = finiteOrNaN(value / 100);
    }
    return value;
  }

  private primary(): number {
    const token = this.take();
    if (token.kind === 'number') return this.config.validateOnly ? 1 : token.value!;
    if (token.kind === 'lparen') {
      if (++this.depth > MAX_DEPTH) throw new Error('Expression nested too deeply');
      const value = this.sum();
      if (this.take().kind !== 'rparen') throw new Error('Missing closing parenthesis');
      this.depth--;
      return value;
    }
    if (token.kind !== 'name') throw new Error('Expected value');
    if (token.text === 'pi') return this.config.validateOnly ? 1 : Math.PI;
    if (token.text === 'e') return this.config.validateOnly ? 1 : Math.E;
    if (token.text === 'x') {
      if (!this.config.graph) throw new Error('x is only available when graphing');
      if (!Number.isFinite(this.config.x)) throw new Error('Invalid x');
      return this.config.validateOnly ? 1 : this.config.x;
    }
    if (this.peek().kind !== 'lparen') throw new Error('Function call requires parentheses');
    this.take();
    if (++this.depth > MAX_DEPTH) throw new Error('Expression nested too deeply');
    const first = this.sum();
    let second: number | undefined;
    if (this.peek().kind === 'comma') { this.take(); second = this.sum(); }
    if (this.take().kind !== 'rparen') throw new Error('Malformed function call');
    this.depth--;
    if (token.text === 'nCr' || token.text === 'nPr') {
      if (this.config.graph || second === undefined) throw new Error(`${token.text} needs two arguments`);
      if (this.config.validateOnly) return 1;
      return finiteOrNaN(token.text === 'nCr' ? comb(first, second) : perm(first, second));
    }
    if (second !== undefined || !UNARY_FUNCTIONS.has(token.text)) throw new Error('Wrong argument count');
    return this.config.validateOnly ? 1 : finiteOrNaN(evaluateFunction(token.text, first, this.config.angleMode));
  }

  private startsImplicitPrimary(): boolean {
    const t = this.peek();
    const previous = this.tokens[this.index - 1];
    // Adjacent numeric tokens indicate a malformed literal (for example
    // `1..2`), not implicit multiplication.
    if (t.kind === 'number' && previous?.kind === 'number') return false;
    return t.kind === 'number' || t.kind === 'name' || t.kind === 'lparen';
  }
}

function exactDegreeTrig(name: string, degrees: number): number {
  const quadrant = degrees / 90;
  if (Number.isSafeInteger(quadrant) && degrees % 90 === 0) {
    const q = ((quadrant % 4) + 4) % 4;
    if (name === 'sin') return [0, 1, 0, -1][q]!;
    if (name === 'cos') return [1, 0, -1, 0][q]!;
    if (q % 2 === 1) return NaN;
    return 0;
  }
  return safeTrig(name, degrees * Math.PI / 180);
}

function safeTrig(name: string, radians: number): number {
  // Handle representationally-exact quadrant inputs (pi/2, pi, ...) in the
  // trig operation itself, without altering unrelated tiny expression values.
  const quadrant = radians / (Math.PI / 2);
  if (Number.isSafeInteger(quadrant) && radians % (Math.PI / 2) === 0) {
    const q = ((quadrant % 4) + 4) % 4;
    if (name === 'sin') return [0, 1, 0, -1][q]!;
    if (name === 'cos') return [1, 0, -1, 0][q]!;
    return q % 2 === 1 ? NaN : 0;
  }
  if (name === 'sin') return Math.sin(radians);
  if (name === 'cos') return Math.cos(radians);
  const cosine = Math.cos(radians);
  if (Math.abs(cosine) < 1e-15) return NaN;
  return Math.sin(radians) / cosine;
}

function evaluateFunction(name: string, value: number, mode: AngleMode): number {
  if (name === 'sin' || name === 'cos' || name === 'tan')
    return mode === 'deg' ? exactDegreeTrig(name, value) : safeTrig(name, value);
  if (name === 'asin' || name === 'acos' || name === 'atan') {
    const fn = name === 'asin' ? Math.asin : name === 'acos' ? Math.acos : Math.atan;
    const result = fn(value);
    return mode === 'deg' ? result * 180 / Math.PI : result;
  }
  if (name === 'sqrt') return Math.sqrt(value);
  if (name === 'cbrt') return Math.cbrt(value);
  if (name === 'abs') return Math.abs(value);
  if (name === 'log') return Math.log10(value);
  if (name === 'ln') return Math.log(value);
  return Math.exp(value);
}

function evaluate(expr: string, config: ParseConfig): number {
  const source = (expr || '').trim();
  if (!source) throw new Error('empty');
  return new Parser(cachedTokens(source), config).parse();
}

export function evalGraphExpr(expr: string, x: number): number {
  return compileGraphExpr(expr)(x);
}

export function compileGraphExpr(expr: string): (x: number) => number {
  const source = (expr || '').trim();
  let tokens: Token[];
  try {
    if (!source) throw new Error('empty');
    tokens = cachedTokens(source);
  } catch { return () => NaN; }
  return (x: number) => {
    try { return new Parser(tokens, { graph: true, x, angleMode: 'rad' }).parse(); }
    catch { return NaN; }
  };
}

// Validate grammar separately from numeric evaluation, so a valid expression
// with a domain gap or overflow at the current x is not labeled invalid syntax.
export function isValidGraphExpr(expr: string): boolean {
  if (!expr.trim()) return true;
  try { evaluate(expr, { graph: true, x: 1, angleMode: 'rad', validateOnly: true }); return true; }
  catch { return false; }
}

export function evalCalcExpr(expr: string, opts: CalcOpts = {}): number {
  return evaluate(expr, { graph: false, x: NaN, angleMode: opts.angleMode || 'rad' });
}

export function factorial(n: number): number {
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return NaN;
  if (n > 170) return Infinity;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function validCountArgs(n: number, r: number): boolean {
  return Number.isSafeInteger(n) && Number.isSafeInteger(r) && n >= 0 && r >= 0;
}

export function comb(n: number, r: number): number {
  if (!validCountArgs(n, r)) return NaN;
  if (r > n) return 0;
  r = Math.min(r, n - r);
  let result = 1;
  for (let i = 1; i <= r; i++) {
    result = result * (n - r + i) / i;
    if (!Number.isFinite(result)) return Infinity;
  }
  return result;
}

export function perm(n: number, r: number): number {
  if (!validCountArgs(n, r)) return NaN;
  if (r > n) return 0;
  let result = 1;
  for (let i = 0; i < r; i++) {
    result *= n - i;
    if (!Number.isFinite(result)) return Infinity;
  }
  return result;
}

// Kept for compatibility with callers/tests that use this normalization helper.
export function convertPowers(str: string): string {
  while (str.includes('^')) {
    const caret = str.lastIndexOf('^');
    let left = caret - 1;
    if (left < 0) throw new Error('No left operand for ^');
    if (str[left] === ')') {
      let depth = 1; left--;
      while (left >= 0 && depth) { if (str[left] === ')') depth++; else if (str[left] === '(') depth--; left--; }
      left++;
      let name = left - 1;
      while (name >= 0 && /[A-Za-z0-9_.]/.test(str[name]!)) name--;
      left = name + 1;
    } else { while (left >= 0 && /[A-Za-z0-9_.]/.test(str[left]!)) left--; left++; }
    let right = caret + 1;
    if (str[right] === '+' || str[right] === '-') right++;
    if (right >= str.length) throw new Error('No right operand for ^');
    if (str[right] === '(') {
      let depth = 1; right++;
      while (right < str.length && depth) { if (str[right] === '(') depth++; else if (str[right] === ')') depth--; right++; }
    } else {
      while (right < str.length && /[A-Za-z0-9_.]/.test(str[right]!)) right++;
      if (str[right] === '(') {
        let depth = 1; right++;
        while (right < str.length && depth) {
          if (str[right] === '(') depth++;
          else if (str[right] === ')') depth--;
          right++;
        }
      }
    }
    str = `${str.slice(0, left)}Math.pow(${str.slice(left, caret)},${str.slice(caret + 1, right)})${str.slice(right)}`;
  }
  return str;
}

// Legacy string utility; evaluation remains delegated to the supplied safe callback.
export function replaceFunc(str: string, funcName: string, reducer: (args: number[]) => string,
  evalArg: (s: string) => number): string {
  const marker = `${funcName}(`;
  let start = str.indexOf(marker);
  while (start >= 0) {
    let i = start + marker.length, depth = 1, argStart = i;
    const args: string[] = [];
    for (; i < str.length && depth; i++) {
      if (str[i] === '(') depth++;
      else if (str[i] === ')') { if (--depth === 0) args.push(str.slice(argStart, i)); }
      else if (str[i] === ',' && depth === 1) { args.push(str.slice(argStart, i)); argStart = i + 1; }
    }
    if (depth) throw new Error('Unbalanced function call');
    str = str.slice(0, start) + reducer(args.map(evalArg)) + str.slice(i);
    start = str.indexOf(marker);
  }
  return str;
}
