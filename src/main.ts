// DOM wiring + event handlers for GraphCalc. All math/state lives in the
// other modules; this file just binds them to the page.

import './styles.css';
import {
  type PlotFn,
  type Window2D,
  drawGraph,
  zoomedWindow,
  squareWindow,
  panWindow,
  canvasToWorld,
  findZeros,
} from './graphing.js';
import { evalGraphExpr, isValidGraphExpr } from './parser.js';
import { Calculator } from './calculator.js';
import {
  parseData,
  oneVarStats,
  linearRegression,
  quadRegression,
  expRegression,
  normalIntervalProbability,
  invNorm,
  cumSum,
  deltaList,
  sortAsc,
  sortDesc,
} from './statistics.js';
import {
  type Matrix,
  matAdd, matSub, matMul, matScalar, matTrans, matTrace, matDet, matInv, matRREF,
  showMatrix,
} from './matrix.js';
import { formatResult } from './format.js';

const FN_COLORS = ['#00d4ff', '#ff8a4c', '#34d399', '#ffd166', '#ff77b7', '#a78bfa', '#ffb74d', '#5eead4'];

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

// ============================
// TAB SWITCHING
// ============================
const TAB_NAMES = ['graph', 'calc', 'stats', 'matrix'] as const;
type TabName = typeof TAB_NAMES[number];

function switchTab(name: TabName): void {
  document.querySelectorAll('.panel-view').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll<HTMLButtonElement>('.tab').forEach((t) => {
    const active = t.dataset.tab === name;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
    t.tabIndex = active ? 0 : -1;
  });
  $(`view-${name}`).classList.add('active');
  if (name === 'graph') setTimeout(() => { resizeCanvas(); render(); }, 50);
  if (name === 'matrix') { buildMatrix('A'); buildMatrix('B'); }
}

document.querySelectorAll<HTMLButtonElement>('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab as TabName));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = TAB_NAMES.indexOf(tab.dataset.tab as TabName);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? TAB_NAMES.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + TAB_NAMES.length) % TAB_NAMES.length;
    switchTab(TAB_NAMES[next]!);
    $<HTMLButtonElement>(`tab-${TAB_NAMES[next]}`).focus();
  });
});

// ============================
// GRAPHING
// ============================
const fns: PlotFn[] = [
  { expr: 'sin(x)', color: FN_COLORS[0]!, enabled: true },
  { expr: 'x^2/4', color: FN_COLORS[1]!, enabled: true },
];
let trace: { fnIndex: number; x: number } | null = null;
let traceMode = false;
let isDragging = false;
let dragStart: [number, number] | null = null;

const canvas = $<HTMLCanvasElement>('graphCanvas');
const ctx = canvas.getContext('2d')!;

function readFiniteInput(id: string, label: string): number {
  const input = $<HTMLInputElement>(id);
  if (!input.value.trim()) throw new Error(`${label} is required`);
  const value = Number(input.value);
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return value;
}

function readWindow(): Window2D {
  const w = {
    xmin: readFiniteInput('xmin', 'X minimum'),
    xmax: readFiniteInput('xmax', 'X maximum'),
    ymin: readFiniteInput('ymin', 'Y minimum'),
    ymax: readFiniteInput('ymax', 'Y maximum'),
  };
  if (w.xmin >= w.xmax) throw new Error('X minimum must be less than X maximum');
  if (w.ymin >= w.ymax) throw new Error('Y minimum must be less than Y maximum');
  if (!Number.isFinite(w.xmax - w.xmin) || !Number.isFinite(w.ymax - w.ymin)) {
    throw new Error('Window range is outside the supported numeric range');
  }
  return w;
}
function writeWindow(w: Window2D): void {
  $<HTMLInputElement>('xmin').value = Number(w.xmin.toPrecision(12)).toString();
  $<HTMLInputElement>('xmax').value = Number(w.xmax.toPrecision(12)).toString();
  $<HTMLInputElement>('ymin').value = Number(w.ymin.toPrecision(12)).toString();
  $<HTMLInputElement>('ymax').value = Number(w.ymax.toPrecision(12)).toString();
  $('coordBox').textContent = 'Window changed — point at the graph or select Zero';
}

function render(): void {
  try {
    drawGraph(ctx, fns, readWindow(), { trace });
    $('windowError').textContent = '';
  } catch (error) {
    $('windowError').textContent = error instanceof Error ? error.message : String(error);
  }
}

function resizeCanvas(): void {
  const area = document.querySelector<HTMLElement>('.graph-area');
  if (!area) return;
  canvas.width = area.clientWidth;
  canvas.height = area.clientHeight;
}

function updateInteractionHint(): void {
  $('graphOverlay').textContent = window.innerWidth <= 700 || window.matchMedia('(pointer: coarse)').matches
    ? 'Drag to pan · Use buttons to zoom'
    : 'Wheel or +/− to zoom · Drag or arrows to pan';
}

function renderFnList(): void {
  const list = $('fnList');
  list.innerHTML = '';
  fns.forEach((fn, i) => {
    const row = document.createElement('div');
    row.className = 'fn-row';
    row.innerHTML = `
      <button class="fn-color" style="background:${fn.color}" aria-label="Change color for function ${i + 1}"></button>
      <input class="fn-input" type="text" value="${escapeAttr(fn.expr)}" placeholder="e.g. sin(x)" aria-label="Function ${i + 1} expression">
      <button class="fn-remove" aria-label="Remove function ${i + 1}">×</button>`;
    const colorDot = row.querySelector<HTMLButtonElement>('.fn-color')!;
    const input = row.querySelector<HTMLInputElement>('.fn-input')!;
    const removeBtn = row.querySelector<HTMLButtonElement>('.fn-remove')!;
    colorDot.addEventListener('click', () => cycleFnColor(i));
    input.addEventListener('input', () => {
      fns[i]!.expr = input.value;
      const valid = isValidGraphExpr(input.value);
      input.classList.toggle('error', !valid);
      input.setAttribute('aria-invalid', String(!valid));
      $('coordBox').textContent = valid ? 'Function changed — point at the graph or select Zero'
        : `Function ${i + 1} has invalid syntax`;
      if (traceMode) updateTraceReadout();
      render();
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') render(); });
    removeBtn.addEventListener('click', () => removeFn(i));
    list.appendChild(row);
  });
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function addFunction(): void {
  fns.push({ expr: '', color: FN_COLORS[fns.length % FN_COLORS.length]!, enabled: true });
  renderFnList();
}
function removeFn(i: number): void {
  fns.splice(i, 1);
  if (traceMode) {
    if (fns.length === 0) toggleTrace();
    else { trace = { fnIndex: 0, x: trace?.x ?? 0 }; updateTraceReadout(); }
  }
  renderFnList();
  render();
}
function cycleFnColor(i: number): void {
  const ci = FN_COLORS.indexOf(fns[i]!.color);
  fns[i]!.color = FN_COLORS[(ci + 1) % FN_COLORS.length]!;
  renderFnList();
  render();
}

function toggleSyntaxHelp(): void {
  const help = $('syntaxHelp');
  const opening = help.style.display === 'none';
  help.style.display = opening ? 'flex' : 'none';
  help.setAttribute('aria-hidden', String(!opening));
  $<HTMLButtonElement>('helpBtn').setAttribute('aria-expanded', String(opening));
  if (opening) $<HTMLButtonElement>('helpCloseBtn').focus();
  else $<HTMLButtonElement>('helpBtn').focus();
}

function zoom(factor: number): void {
  try { writeWindow(zoomedWindow(readWindow(), factor)); render(); }
  catch (error) { $('windowError').textContent = error instanceof Error ? error.message : String(error); }
}
function resetWindow(): void {
  writeWindow({ xmin: -10, xmax: 10, ymin: -10, ymax: 10 });
  render();
}
function squareWin(): void {
  try { writeWindow(squareWindow(readWindow(), canvas.width, canvas.height)); render(); }
  catch (error) { $('windowError').textContent = error instanceof Error ? error.message : String(error); }
}
function toggleTrace(): void {
  traceMode = !traceMode;
  const btn = $<HTMLButtonElement>('traceBtn');
  btn.classList.toggle('active', traceMode);
  btn.setAttribute('aria-pressed', String(traceMode));
  if (traceMode) {
    try {
      const w = readWindow();
      trace = { fnIndex: 0, x: (w.xmin + w.xmax) / 2 };
    } catch (error) {
      traceMode = false;
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
      $('windowError').textContent = error instanceof Error ? error.message : String(error);
      return;
    }
  } else {
    trace = null;
    $('traceInfo').style.display = 'none';
  }
  render();
  if (traceMode) updateTraceReadout();
}
function findZero(): void {
  if (!fns[0] || !fns[0].expr.trim()) return;
  if (!isValidGraphExpr(fns[0].expr)) {
    $('coordBox').textContent = 'Function 1 has invalid syntax';
    return;
  }
  let w: Window2D;
  try { w = readWindow(); }
  catch (error) {
    $('windowError').textContent = error instanceof Error ? error.message : String(error);
    return;
  }
  const zeros = findZeros(fns[0].expr, w.xmin, w.xmax);
  const box = $('coordBox');
  if (zeros.length === 0) {
    box.innerHTML = '<span style="color:var(--accent2)">No zeros detected at the current sampling resolution</span>';
  } else {
    box.innerHTML = zeros.map((z) => `Candidate: <span>x = ${z.toFixed(6)}</span>`).join('<br>');
  }
}

// Bind sidebar buttons & inputs
$('addFnBtn').addEventListener('click', addFunction);
$('helpBtn').addEventListener('click', toggleSyntaxHelp);
$('helpCloseBtn').addEventListener('click', toggleSyntaxHelp);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && $('syntaxHelp').style.display !== 'none') toggleSyntaxHelp();
});
['xmin', 'xmax', 'ymin', 'ymax'].forEach((id) => {
  $<HTMLInputElement>(id).addEventListener('input', () => {
    $('coordBox').textContent = 'Window changed — point at the graph or select Zero';
    $('traceInfo').style.display = 'none';
  });
  $<HTMLInputElement>(id).addEventListener('change', render);
});
$('zoomInBtn').addEventListener('click', () => zoom(0.5));
$('zoomOutBtn').addEventListener('click', () => zoom(2));
$('stdWinBtn').addEventListener('click', resetWindow);
$('sqWinBtn').addEventListener('click', squareWin);
$('traceBtn').addEventListener('click', toggleTrace);
$('zeroBtn').addEventListener('click', findZero);

// Canvas pointer, touch, and keyboard interactions.
canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
  let w: Window2D;
  try { w = readWindow(); } catch { return; }
  const [wx, wy] = canvasToWorld(cx, cy, w, canvas.width, canvas.height);
  $('coordBox').innerHTML = `x = <span>${wx.toFixed(4)}</span><br>y = <span>${wy.toFixed(4)}</span>`;
  if (traceMode && trace) {
    trace.x = wx;
    render();
    updateTraceReadout();
  } else if (isDragging && dragStart) {
    const dx = wx - dragStart[0];
    const dy = wy - dragStart[1];
    writeWindow(panWindow(w, dx, dy));
    render();
  }
});
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
  let w: Window2D;
  try { w = readWindow(); } catch { return; }
  dragStart = canvasToWorld(cx, cy, w, canvas.width, canvas.height);
  isDragging = true;
});
canvas.addEventListener('pointerup', (e) => { canvas.releasePointerCapture(e.pointerId); isDragging = false; dragStart = null; });
canvas.addEventListener('pointercancel', () => { isDragging = false; dragStart = null; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoom(e.deltaY > 0 ? 1.15 : 0.87);
}, { passive: false });
canvas.addEventListener('keydown', (event) => {
  if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(0.8); return; }
  if (event.key === '-') { event.preventDefault(); zoom(1.25); return; }
  if (event.key.toLowerCase() === 't') { event.preventDefault(); toggleTrace(); return; }
  const direction: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1],
  };
  const delta = direction[event.key];
  if (!delta) return;
  event.preventDefault();
  try {
    const w = readWindow();
    writeWindow(panWindow(w, delta[0] * (w.xmax - w.xmin) * 0.1, delta[1] * (w.ymax - w.ymin) * 0.1));
    render();
  } catch { /* render already reports invalid windows */ }
});

function updateTraceReadout(): void {
  if (!trace) return;
  const fn = fns[trace.fnIndex];
  if (!fn) return;
  const y = evalGraphExpr(fn.expr, trace.x);
  const info = $('traceInfo');
  if (Number.isNaN(y) || !isFinite(y)) {
    info.textContent = `x = ${trace.x.toFixed(4)}   y = —`;
  } else {
    info.textContent = `x = ${trace.x.toFixed(4)}   y = ${y.toFixed(4)}`;
  }
  info.style.display = 'block';
}

// ============================
// SCIENTIFIC CALCULATOR
// ============================
const calc = new Calculator();

function refreshCalc(): void {
  const s = calc.snapshot();
  $('calcExpr').textContent = s.expr || '';
  $('calcHistory').textContent = s.history;
  $('calcResult').textContent = s.result;
  $('modeDeg').classList.toggle('active', s.angleMode === 'deg');
  $('modeRad').classList.toggle('active', s.angleMode === 'rad');
  $('shiftBtn').classList.toggle('active', s.shift);
  $<HTMLButtonElement>('modeDeg').setAttribute('aria-pressed', String(s.angleMode === 'deg'));
  $<HTMLButtonElement>('modeRad').setAttribute('aria-pressed', String(s.angleMode === 'rad'));
  $<HTMLButtonElement>('shiftBtn').setAttribute('aria-pressed', String(s.shift));
  $('calcShell').classList.toggle('shift-active', s.shift);
}

// Build the keypad declaratively so it's easy to maintain.
interface KeyDef { label: string; top?: string; cls?: string; action: () => void }

const keys: KeyDef[] = [
  { label: 'sin', top: 'asin', cls: 'fn', action: () => { calc.pressFn('sin('); refreshCalc(); } },
  { label: 'cos', top: 'acos', cls: 'fn', action: () => { calc.pressFn('cos('); refreshCalc(); } },
  { label: 'tan', top: 'atan', cls: 'fn', action: () => { calc.pressFn('tan('); refreshCalc(); } },
  { label: 'log', top: '10^x', cls: 'fn', action: () => { calc.pressFn('log('); refreshCalc(); } },
  { label: 'ln',  top: 'e^x',  cls: 'fn', action: () => { calc.pressFn('ln(');  refreshCalc(); } },

  { label: '√',   top: 'x²',   cls: 'fn', action: () => { calc.pressFn('sqrt('); refreshCalc(); } },
  { label: 'xʸ',               cls: 'fn', action: () => { calc.pressFn('^');     refreshCalc(); } },
  { label: '|x|',              cls: 'fn', action: () => { calc.pressFn('abs(');  refreshCalc(); } },
  { label: 'π',   top: 'e',    cls: 'fn', action: () => { calc.pressFn('pi');    refreshCalc(); } },
  { label: '( )',              cls: 'fn', action: () => { calc.pressFn('()');    refreshCalc(); } },

  { label: 'C',   cls: 'clear', action: () => { calc.clear(); refreshCalc(); } },
  { label: '⌫',   cls: 'clear', action: () => { calc.del();   refreshCalc(); } },
  { label: '%',   cls: 'fn',    action: () => { calc.pressFn('%'); refreshCalc(); } },
  { label: 'n!',  cls: 'fn',    action: () => { calc.pressFn('!'); refreshCalc(); } },
  { label: '÷',   cls: 'op',    action: () => { calc.pressOp('/'); refreshCalc(); } },

  { label: '7',   action: () => { calc.pressNum('7'); refreshCalc(); } },
  { label: '8',   action: () => { calc.pressNum('8'); refreshCalc(); } },
  { label: '9',   action: () => { calc.pressNum('9'); refreshCalc(); } },
  { label: 'EE',  cls: 'fn', action: () => { calc.pressFn('E'); refreshCalc(); } },
  { label: '×',   cls: 'op', action: () => { calc.pressOp('*'); refreshCalc(); } },

  { label: '4',   action: () => { calc.pressNum('4'); refreshCalc(); } },
  { label: '5',   action: () => { calc.pressNum('5'); refreshCalc(); } },
  { label: '6',   action: () => { calc.pressNum('6'); refreshCalc(); } },
  { label: 'ANS', cls: 'fn', action: () => { calc.pressAns(); refreshCalc(); } },
  { label: '−',   cls: 'op', action: () => { calc.pressOp('-'); refreshCalc(); } },

  { label: '1',   action: () => { calc.pressNum('1'); refreshCalc(); } },
  { label: '2',   action: () => { calc.pressNum('2'); refreshCalc(); } },
  { label: '3',   action: () => { calc.pressNum('3'); refreshCalc(); } },
  { label: 'nCr', cls: 'fn', action: () => { calc.pressFn('nCr('); refreshCalc(); } },
  { label: '+',   cls: 'op', action: () => { calc.pressOp('+'); refreshCalc(); } },

  { label: '0',   action: () => { calc.pressNum('0'); refreshCalc(); } },
  { label: '.',   action: () => { calc.pressNum('.'); refreshCalc(); } },
  { label: ',',   cls: 'fn', action: () => { calc.pressOp(','); refreshCalc(); } },
  { label: 'nPr', cls: 'fn', action: () => { calc.pressFn('nPr('); refreshCalc(); } },
  { label: '=',   cls: 'eq', action: () => { calc.equals(); refreshCalc(); } },
];

function buildKeypad(): void {
  const grid = $('calcKeys');
  grid.innerHTML = '';
  for (const k of keys) {
    const btn = document.createElement('button');
    btn.className = 'key' + (k.cls ? ' ' + k.cls : '');
    const keyNames: Record<string, string> = {
      '√': 'square root', 'xʸ': 'power', '|x|': 'absolute value', 'π': 'pi', '( )': 'parenthesis',
      '⌫': 'delete', '%': 'percent', 'n!': 'factorial', '÷': 'divide', 'EE': 'scientific notation exponent',
      'ANS': 'previous answer', '−': 'subtract', 'nCr': 'combinations', 'nPr': 'permutations', '×': 'multiply',
    };
    btn.setAttribute('aria-label', keyNames[k.label] || k.label);
    if (k.top) {
      const sup = document.createElement('span');
      sup.className = 'key-top';
      sup.textContent = k.top;
      btn.appendChild(sup);
    }
    btn.appendChild(document.createTextNode(k.label));
    btn.addEventListener('click', k.action);
    grid.appendChild(btn);
  }
}

$('modeDeg').addEventListener('click', () => { calc.setAngleMode('deg'); refreshCalc(); });
$('modeRad').addEventListener('click', () => { calc.setAngleMode('rad'); refreshCalc(); });
$('shiftBtn').addEventListener('click', () => { calc.toggleShift(); refreshCalc(); });

// Keyboard input on the calculator view
window.addEventListener('keydown', (e) => {
  if (!$('view-calc').classList.contains('active')) return;
  if (e.key >= '0' && e.key <= '9') calc.pressNum(e.key);
  else if (e.key === '+') calc.pressOp('+');
  else if (e.key === '-') calc.pressOp('-');
  else if (e.key === '*') calc.pressOp('*');
  else if (e.key === '/') { e.preventDefault(); calc.pressOp('/'); }
  else if (e.key === '.') calc.pressNum('.');
  else if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); calc.equals(); }
  else if (e.key === 'Backspace') calc.del();
  else if (e.key === 'Escape') calc.clear();
  else if (e.key === '(') calc.pressFn('(');
  else if (e.key === ')') calc.pressFn(')');
  else if (e.key === '^') calc.pressOp('^');
  else if (e.key === ',') calc.pressOp(',');
  else return;
  refreshCalc();
});

// ============================
// STATISTICS
// ============================
function fmtStat(v: number): string {
  return Number.isFinite(v) ? formatResult(v) : '—';
}

$('calc1VarBtn').addEventListener('click', () => {
  const output = $('stat1Results');
  try {
    const data = parseData($<HTMLTextAreaElement>('statData1').value);
    const r = oneVarStats(data);
    if (!r) throw new Error('Enter at least one data value');
    const items: Array<[string, string | number]> = [
      ['n', r.n], ['x̄', fmtStat(r.mean)], ['Sx', fmtStat(r.sampleStdDev)],
      ['σx', fmtStat(r.popStdDev)], ['Σx', fmtStat(r.sum)], ['Σx²', fmtStat(r.sumSq)],
      ['Med', fmtStat(r.median)], ['Q1', fmtStat(r.q1)], ['Q3', fmtStat(r.q3)], ['IQR', fmtStat(r.iqr)],
      ['Min', fmtStat(r.min)], ['Max', fmtStat(r.max)],
    ];
    output.classList.remove('error-message');
    output.innerHTML = items.map(([l, v]) =>
      `<div class="stat-item"><div class="stat-label">${l}</div><div class="stat-val">${v}</div></div>`).join('');
  } catch (error) {
    output.classList.add('error-message');
    output.textContent = error instanceof Error ? error.message : String(error);
  }
});

function readXY(): [number[], number[]] {
  const xs = parseData($<HTMLTextAreaElement>('statDataX').value);
  const ys = parseData($<HTMLTextAreaElement>('statDataY').value);
  return [xs, ys];
}
function showRegError(msg: string): void { $('regResult').classList.add('error-message'); $('regResult').textContent = msg; }

function withXY(run: (xs: number[], ys: number[]) => void): void {
  try {
    const [xs, ys] = readXY();
    if (xs.length !== ys.length) throw new Error('X and Y must contain the same number of values');
    $('regResult').classList.remove('error-message');
    run(xs, ys);
  } catch (error) {
    showRegError(error instanceof Error ? error.message : String(error));
  }
}

$('linRegBtn').addEventListener('click', () => {
  withXY((xs, ys) => {
  const r = linearRegression(xs, ys);
  if ('error' in r) return showRegError(r.error);
  $('regResult').textContent =
    `y = a + bx\na (intercept) = ${fmtStat(r.intercept)}\nb (slope) = ${fmtStat(r.slope)}\n` +
    `r² = ${fmtStat(r.r2)}\nr = ${fmtStat(r.r)}`;
  });
});
$('quadRegBtn').addEventListener('click', () => {
  withXY((xs, ys) => {
  const r = quadRegression(xs, ys);
  if ('error' in r) return showRegError(r.error);
  const sign = (v: number, leading: boolean): string => {
    if (leading) return fmtStat(v);
    return v < 0 ? '− ' + fmtStat(Math.abs(v)) : '+ ' + fmtStat(v);
  };
  $('regResult').textContent =
    `y = ${sign(r.a, true)}x² ${sign(r.b, false)}x ${sign(r.c, false)}\n` +
    `a = ${fmtStat(r.a)}\nb = ${fmtStat(r.b)}\nc = ${fmtStat(r.c)}`;
  });
});
$('expRegBtn').addEventListener('click', () => {
  withXY((xs, ys) => {
  const r = expRegression(xs, ys);
  if ('error' in r) return showRegError(r.error);
  $('regResult').textContent = `y = a · e^(bx)\na = ${fmtStat(r.a)}\nb = ${fmtStat(r.b)}`;
  });
});

function readDistributionBase(): [number, number] {
  const mu = readFiniteInput('distMu', 'Mean');
  const sigma = readFiniteInput('distSigma', 'Standard deviation');
  if (sigma <= 0) throw new Error('Standard deviation must be greater than zero');
  return [mu, sigma];
}

function showDistributionError(error: unknown): void {
  $('distResult').classList.add('error-message');
  $('distResult').textContent = error instanceof Error ? error.message : String(error);
}

$('normCdfBtn').addEventListener('click', () => {
  try {
    const [mu, sigma] = readDistributionBase();
    const lo = readFiniteInput('distLow', 'Lower bound');
    const hi = readFiniteInput('distHigh', 'Upper bound');
    if (lo > hi) throw new Error('Lower bound must not exceed upper bound');
    const p = normalIntervalProbability(lo, hi, mu, sigma);
    $('distResult').classList.remove('error-message');
    $('distResult').textContent = `normalcdf(${lo}, ${hi}, ${mu}, ${sigma})\n= ${formatResult(p)}`;
  } catch (error) { showDistributionError(error); }
});
$('invNormBtn').addEventListener('click', () => {
  try {
    const [mu, sigma] = readDistributionBase();
    const p = readFiniteInput('distProb', 'Left-tail probability');
    if (p <= 0 || p >= 1) throw new Error('Left-tail probability must be between 0 and 1');
    const x = invNorm(p, mu, sigma);
    $('distResult').classList.remove('error-message');
    $('distResult').textContent = `invNorm(${p}, ${mu}, ${sigma})\n= ${formatResult(x)}`;
  } catch (error) { showDistributionError(error); }
});

function listResult(arr: number[]): void {
  $('listResult').classList.remove('error-message');
  $('listResult').textContent = '{' + arr.join(', ') + '}';
}
function runList(operation: (data: number[]) => number[]): void {
  try {
    const data = parseData($<HTMLTextAreaElement>('listData').value);
    if (data.length === 0) throw new Error('Enter at least one data value');
    listResult(operation(data));
  } catch (error) {
    $('listResult').classList.add('error-message');
    $('listResult').textContent = error instanceof Error ? error.message : String(error);
  }
}
$('sortAscBtn').addEventListener('click', () => runList(sortAsc));
$('sortDescBtn').addEventListener('click', () => runList(sortDesc));
$('cumSumBtn').addEventListener('click', () => runList(cumSum));
$('deltaBtn').addEventListener('click', () => runList(deltaList));

// ============================
// MATRIX
// ============================
function buildMatrix(name: 'A' | 'B'): void {
  let rows: number, cols: number;
  try {
    rows = readMatrixSize(name, 'Rows');
    cols = readMatrixSize(name, 'Cols');
  } catch (error) {
    $('matrixResult').classList.add('error-message');
    $('matrixResult').textContent = error instanceof Error ? error.message : String(error);
    return;
  }
  const grid = $('matrix' + name);
  grid.style.gridTemplateColumns = `repeat(${cols}, 52px)`;
  // Preserve existing values when resizing.
  const old: Record<string, string> = {};
  grid.querySelectorAll<HTMLInputElement>('input').forEach((inp) => { old[inp.id] = inp.value; });
  grid.innerHTML = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'matrix-cell';
      input.id = `mat${name}_${r}_${c}`;
      input.setAttribute('aria-label', `Matrix ${name}, row ${r + 1}, column ${c + 1}`);
      const prev = old[input.id];
      input.value = prev !== undefined ? prev : (r === c ? '1' : '0');
      input.addEventListener('input', () => {
        $('matrixResult').classList.remove('error-message');
        $('matrixResult').textContent = 'Inputs changed — select an operation';
      });
      grid.appendChild(input);
    }
  }
  const output = $('matrixResult');
  if (output.textContent !== 'Select an operation') {
    output.classList.remove('error-message');
    output.textContent = 'Inputs changed — select an operation';
  }
}

function readMatrixSize(name: 'A' | 'B', dimension: 'Rows' | 'Cols'): number {
  const value = readFiniteInput(name.toLowerCase() + dimension, `Matrix ${name} ${dimension.toLowerCase()}`);
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error(`Matrix ${name} ${dimension.toLowerCase()} must be an integer from 1 to 5`);
  }
  return value;
}

function readMatrix(name: 'A' | 'B'): Matrix {
  const rows = readMatrixSize(name, 'Rows');
  const cols = readMatrixSize(name, 'Cols');
  const M: Matrix = [];
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c++) {
      row.push(readFiniteInput(`mat${name}_${r}_${c}`, `Matrix ${name}, row ${r + 1}, column ${c + 1}`));
    }
    M.push(row);
  }
  return M;
}

type MatOp = 'add' | 'sub' | 'mul' | 'det' | 'trans' | 'inv' | 'scalar' | 'rref' | 'trace';

function matOp(op: MatOp): void {
  let result = '';
  try {
    const A = readMatrix('A');
    if (op === 'add')        result = showMatrix(matAdd(A, readMatrix('B')));
    else if (op === 'sub')   result = showMatrix(matSub(A, readMatrix('B')));
    else if (op === 'mul')   result = showMatrix(matMul(A, readMatrix('B')));
    else if (op === 'det')   result = 'det(A) = ' + formatResult(matDet(A));
    else if (op === 'trans') result = showMatrix(matTrans(A));
    else if (op === 'inv') {
      const inv = matInv(A);
      result = inv ? showMatrix(inv) : 'Matrix not invertible';
    } else if (op === 'scalar') {
      const k = readFiniteInput('matrixScalar', 'Scalar k');
      result = showMatrix(matScalar(A, k));
    } else if (op === 'rref') {
      result = showMatrix(matRREF(A));
    } else if (op === 'trace') {
      result = 'tr(A) = ' + matTrace(A);
    }
  } catch (e) {
    result = 'Error: ' + (e instanceof Error ? e.message : String(e));
  }
  $('matrixResult').classList.toggle('error-message', result.startsWith('Error:') || result === 'Matrix not invertible');
  $('matrixResult').textContent = result;
}

['aRows', 'aCols'].forEach((id) => $<HTMLInputElement>(id).addEventListener('change', () => buildMatrix('A')));
['bRows', 'bCols'].forEach((id) => $<HTMLInputElement>(id).addEventListener('change', () => buildMatrix('B')));
$<HTMLInputElement>('matrixScalar').addEventListener('input', () => {
  $('matrixResult').classList.remove('error-message');
  $('matrixResult').textContent = 'Inputs changed — select an operation';
});

function invalidateResult(inputIds: string[], outputId: string, message = 'Inputs changed — recalculate'): void {
  for (const id of inputIds) {
    $(id).addEventListener('input', () => {
      $(outputId).classList.remove('error-message');
      $(outputId).textContent = message;
    });
  }
}

invalidateResult(['statData1'], 'stat1Results');
invalidateResult(['statDataX', 'statDataY'], 'regResult');
invalidateResult(['distMu', 'distSigma', 'distLow', 'distHigh', 'distProb'], 'distResult');
invalidateResult(['listData'], 'listResult');

document.querySelectorAll<HTMLButtonElement>('[data-matop]').forEach((btn) => {
  btn.addEventListener('click', () => matOp(btn.dataset.matop as MatOp));
});

// ============================
// INIT
// ============================
window.addEventListener('resize', () => {
  updateInteractionHint();
  if ($('view-graph').classList.contains('active')) {
    resizeCanvas();
    render();
  }
});

renderFnList();
buildKeypad();
refreshCalc();
updateInteractionHint();
buildMatrix('A');
buildMatrix('B');
resizeCanvas();
setTimeout(() => { resizeCanvas(); render(); }, 100);
