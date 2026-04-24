// Scientific calculator state machine. Holds the current expression, ANS
// register, shift mode, and angle mode. Pure logic — main.ts wires this to
// the keypad and display.

import { evalCalcExpr, type AngleMode } from './parser.js';
import { formatResult } from './format.js';

const SHIFT_MAP: Record<string, string> = {
  'sin(': 'asin(',
  'cos(': 'acos(',
  'tan(': 'atan(',
  'log(': '10^',
  'ln(': 'e^',
  'sqrt(': '^2',
  'pi': 'e',
};

export interface CalcSnapshot {
  expr: string;
  history: string;
  result: string;
  ans: number;
  angleMode: AngleMode;
  shift: boolean;
}

export class Calculator {
  private expr = '';
  private history = '';
  private result = '0';
  private ans = 0;
  private angleMode: AngleMode = 'deg';
  private shift = false;

  snapshot(): CalcSnapshot {
    return {
      expr: this.expr,
      history: this.history,
      result: this.result,
      ans: this.ans,
      angleMode: this.angleMode,
      shift: this.shift,
    };
  }

  pressNum(n: string): void {
    this.expr += n;
  }

  pressOp(op: string): void {
    this.expr += op;
  }

  // For function keys. If shift is on and we have an alternate, use that.
  // Special case '()' inserts the appropriate paren.
  pressFn(token: string): void {
    if (this.shift && SHIFT_MAP[token]) {
      this.expr += SHIFT_MAP[token];
      this.shift = false;
      return;
    }
    if (token === '()') {
      this.expr += this.openOrClose() ? '(' : ')';
      return;
    }
    this.expr += token;
  }

  private openOrClose(): boolean {
    let opens = 0;
    for (const c of this.expr) {
      if (c === '(') opens++;
      else if (c === ')') opens--;
    }
    return opens <= 0 || this.expr.slice(-1) === '(';
  }

  pressAns(): void {
    // Wrap in parens so that ANS interacts safely with surrounding operators.
    this.expr += `(${this.ans})`;
  }

  clear(): void {
    this.expr = '';
    this.result = '0';
    this.history = '';
  }

  del(): void {
    this.expr = this.expr.slice(0, -1);
  }

  toggleShift(): void { this.shift = !this.shift; }
  setAngleMode(m: AngleMode): void { this.angleMode = m; }
  getAngleMode(): AngleMode { return this.angleMode; }
  isShift(): boolean { return this.shift; }

  // Returns true on success. On error, sets result to 'Error' and leaves expr
  // intact so the user can edit it.
  equals(): boolean {
    if (!this.expr.trim()) return false;
    try {
      const value = evalCalcExpr(this.expr, { angleMode: this.angleMode });
      if (Number.isNaN(value)) {
        this.result = 'Error';
        return false;
      }
      this.history = this.expr + ' =';
      this.result = formatResult(value);
      this.ans = value;
      this.expr = '';
      return true;
    } catch {
      this.result = 'Error';
      return false;
    }
  }
}
