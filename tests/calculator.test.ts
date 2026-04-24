import { describe, it, expect } from 'vitest';
import { Calculator } from '../src/calculator.js';

describe('Calculator', () => {
  it('basic arithmetic via keypad presses', () => {
    const c = new Calculator();
    c.pressNum('2');
    c.pressOp('+');
    c.pressNum('3');
    c.equals();
    expect(c.snapshot().result).toBe('5');
    expect(c.snapshot().ans).toBe(5);
  });

  it('ANS recall wraps in parens so it composes safely', () => {
    const c = new Calculator();
    c.pressNum('5'); c.equals();
    c.pressOp('-'); c.pressAns();
    c.equals();
    // -5 + 0 = ... actually after first equals ans=5 and expr cleared.
    // Then -, ANS -> "-(5)". Equals -> -5.
    expect(c.snapshot().result).toBe('-5');
  });

  it('clear resets state', () => {
    const c = new Calculator();
    c.pressNum('1'); c.pressOp('+'); c.pressNum('2');
    c.clear();
    expect(c.snapshot().expr).toBe('');
    expect(c.snapshot().result).toBe('0');
  });

  it('del removes last char', () => {
    const c = new Calculator();
    c.pressNum('1'); c.pressNum('2'); c.pressNum('3');
    c.del();
    expect(c.snapshot().expr).toBe('12');
  });

  it('shift maps sin → asin once, then turns off', () => {
    const c = new Calculator();
    c.toggleShift();
    expect(c.isShift()).toBe(true);
    c.pressFn('sin(');
    expect(c.snapshot().expr).toBe('asin(');
    expect(c.isShift()).toBe(false);
  });

  it('shift maps sqrt → ^2', () => {
    const c = new Calculator();
    c.pressNum('5');
    c.toggleShift();
    c.pressFn('sqrt(');
    expect(c.snapshot().expr).toBe('5^2');
    c.equals();
    expect(c.snapshot().result).toBe('25');
  });

  it('parens key auto-balances', () => {
    const c = new Calculator();
    c.pressFn('()'); // opens
    c.pressNum('2');
    c.pressFn('()'); // closes
    expect(c.snapshot().expr).toBe('(2)');
  });

  it('angle mode propagates to evaluation', () => {
    const c = new Calculator();
    c.setAngleMode('deg');
    c.pressFn('sin(');
    c.pressNum('3'); c.pressNum('0');
    c.pressFn(')');
    c.equals();
    expect(parseFloat(c.snapshot().result)).toBeCloseTo(0.5, 6);
  });

  it('error sets result without crashing state', () => {
    const c = new Calculator();
    c.pressOp('+'); c.pressOp('+');
    c.equals();
    expect(c.snapshot().result).toBe('Error');
  });

  it('factorial workflow', () => {
    const c = new Calculator();
    c.pressNum('5'); c.pressFn('!');
    c.equals();
    expect(c.snapshot().result).toBe('120');
  });

  it('chained equals reuses result via ANS', () => {
    const c = new Calculator();
    c.pressNum('1'); c.pressNum('0'); c.equals();
    c.pressAns(); c.pressOp('*'); c.pressNum('2'); c.equals();
    expect(c.snapshot().result).toBe('20');
  });
});
