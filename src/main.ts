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
import { evalGraphExpr } from './parser.js';
import { Calculator } from './calculator.js';
import {
  parseData,
  oneVarStats,
  linearRegression,
  quadRegression,
  expRegression,
  normalCDF,
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
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  $(`view-${name}`).classList.add('active');
  const tabs = document.querySelectorAll<HTMLButtonElement>('.tab');
  tabs[TAB_NAMES.indexOf(name)]?.classList.add('active');
  if (name === 'graph') setTimeout(() => { resizeCanvas(); render(); }, 50);
  if (name === 'matrix') { buildMatrix('A'); buildMatrix('B'); }
}

document.querySelectorAll<HTMLButtonElement>('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab as TabName));
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

function readWindow(): Window2D {
  return {
    xmin: +$<HTMLInputElement>('xmin').value,
    xmax: +$<HTMLInputElement>('xmax').value,
    ymin: +$<HTMLInputElement>('ymin').value,
    ymax: +$<HTMLInputElement>('ymax').value,
  };
}
function writeWindow(w: Window2D): void {
  $<HTMLInputElement>('xmin').value = parseFloat(w.xmin.toFixed(4)).toString();
  $<HTMLInputElement>('xmax').value = parseFloat(w.xmax.toFixed(4)).toString();
  $<HTMLInputElement>('ymin').value = parseFloat(w.ymin.toFixed(4)).toString();
  $<HTMLInputElement>('ymax').value = parseFloat(w.ymax.toFixed(4)).toString();
}

function render(): void {
  drawGraph(ctx, fns, readWindow(), { trace });
}

function resizeCanvas(): void {
  const area = document.querySelector<HTMLElement>('.graph-area');
  if (!area) return;
  canvas.width = area.clientWidth;
  canvas.height = area.clientHeight;
}

function renderFnList(): void {
  const list = $('fnList');
  list.innerHTML = '';
  fns.forEach((fn, i) => {
    const row = document.createElement('div');
    row.className = 'fn-row';
    row.innerHTML = `
      <div class="fn-color" style="background:${fn.color}" title="Click to cycle color"></div>
      <input class="fn-input" type="text" value="${escapeAttr(fn.expr)}" placeholder="e.g. sin(x)">
      <button class="fn-remove" title="Remove">×</button>`;
    const colorDot = row.querySelector<HTMLDivElement>('.fn-color')!;
    const input = row.querySelector<HTMLInputElement>('.fn-input')!;
    const removeBtn = row.querySelector<HTMLButtonElement>('.fn-remove')!;
    colorDot.addEventListener('click', () => cycleFnColor(i));
    input.addEventListener('input', () => { fns[i]!.expr = input.value; render(); });
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
  help.style.display = help.style.display === 'none' ? 'flex' : 'none';
}

function zoom(factor: number): void {
  writeWindow(zoomedWindow(readWindow(), factor));
  render();
}
function resetWindow(): void {
  writeWindow({ xmin: -10, xmax: 10, ymin: -10, ymax: 10 });
  render();
}
function squareWin(): void {
  writeWindow(squareWindow(readWindow(), canvas.width, canvas.height));
  render();
}
function toggleTrace(): void {
  traceMode = !traceMode;
  const btn = $('traceBtn');
  btn.classList.toggle('active', traceMode);
  if (traceMode) {
    const w = readWindow();
    trace = { fnIndex: 0, x: (w.xmin + w.xmax) / 2 };
  } else {
    trace = null;
    $('traceInfo').style.display = 'none';
  }
  render();
}
function findZero(): void {
  if (!fns[0] || !fns[0].expr.trim()) return;
  const w = readWindow();
  const zeros = findZeros(fns[0].expr, w.xmin, w.xmax);
  const box = $('coordBox');
  if (zeros.length === 0) {
    box.innerHTML = '<span style="color:var(--accent2)">No zeros found in window</span>';
  } else {
    box.innerHTML = zeros.map((z) => `Zero: <span>x = ${z.toFixed(6)}</span>`).join('<br>');
  }
}

// Bind sidebar buttons & inputs
$('addFnBtn').addEventListener('click', addFunction);
$('helpBtn').addEventListener('click', toggleSyntaxHelp);
$('helpCloseBtn').addEventListener('click', toggleSyntaxHelp);
['xmin', 'xmax', 'ymin', 'ymax'].forEach((id) => {
  $<HTMLInputElement>(id).addEventListener('change', render);
});
$('zoomInBtn').addEventListener('click', () => zoom(0.5));
$('zoomOutBtn').addEventListener('click', () => zoom(2));
$('stdWinBtn').addEventListener('click', resetWindow);
$('sqWinBtn').addEventListener('click', squareWin);
$('traceBtn').addEventListener('click', toggleTrace);
$('zeroBtn').addEventListener('click', findZero);

// Canvas mouse interactions
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
  const w = readWindow();
  const [wx, wy] = canvasToWorld(cx, cy, w, canvas.width, canvas.height);
  $('coordBox').innerHTML = `x = <span>${wx.toFixed(4)}</span><br>y = <span>${wy.toFixed(4)}</span>`;
  if (traceMode && trace) {
    trace.x = wx;
    render();
    updateTraceReadout();
  }
  if (isDragging && dragStart) {
    const dx = wx - dragStart[0];
    const dy = wy - dragStart[1];
    writeWindow(panWindow(w, dx, dy));
    render();
  }
});
canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
  dragStart = canvasToWorld(cx, cy, readWindow(), canvas.width, canvas.height);
  isDragging = true;
});
canvas.addEventListener('mouseup', () => { isDragging = false; dragStart = null; });
canvas.addEventListener('mouseleave', () => { isDragging = false; dragStart = null; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoom(e.deltaY > 0 ? 1.15 : 0.87);
}, { passive: false });

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
  return Number.isFinite(v) ? parseFloat(v.toFixed(6)).toString() : '—';
}

$('calc1VarBtn').addEventListener('click', () => {
  const data = parseData($<HTMLTextAreaElement>('statData1').value);
  const r = oneVarStats(data);
  if (!r) return;
  const items: Array<[string, string | number]> = [
    ['n', r.n], ['x̄', fmtStat(r.mean)], ['Sx', fmtStat(r.sampleStdDev)],
    ['σx', fmtStat(r.popStdDev)], ['Σx', fmtStat(r.sum)], ['Σx²', fmtStat(r.sumSq)],
    ['Med', fmtStat(r.median)], ['Q1', fmtStat(r.q1)], ['Q3', fmtStat(r.q3)], ['IQR', fmtStat(r.iqr)],
    ['Min', fmtStat(r.min)], ['Max', fmtStat(r.max)],
  ];
  $('stat1Results').innerHTML = items.map(([l, v]) =>
    `<div class="stat-item"><div class="stat-label">${l}</div><div class="stat-val">${v}</div></div>`).join('');
});

function readXY(): [number[], number[]] {
  const xs = parseData($<HTMLTextAreaElement>('statDataX').value);
  const ys = parseData($<HTMLTextAreaElement>('statDataY').value);
  return [xs, ys];
}
function showRegError(msg: string): void { $('regResult').textContent = msg; }

$('linRegBtn').addEventListener('click', () => {
  const [xs, ys] = readXY();
  const r = linearRegression(xs, ys);
  if ('error' in r) return showRegError(r.error);
  $('regResult').textContent =
    `y = a + bx\na (intercept) = ${r.intercept.toFixed(6)}\nb (slope) = ${r.slope.toFixed(6)}\n` +
    `r² = ${r.r2.toFixed(6)}\nr = ${r.r.toFixed(6)}`;
});
$('quadRegBtn').addEventListener('click', () => {
  const [xs, ys] = readXY();
  const r = quadRegression(xs, ys);
  if ('error' in r) return showRegError(r.error);
  const sign = (v: number, leading: boolean): string => {
    const rounded = parseFloat(v.toFixed(4));
    if (leading) return rounded.toString();
    return rounded < 0 ? '− ' + Math.abs(rounded).toString() : '+ ' + rounded.toString();
  };
  $('regResult').textContent =
    `y = ${sign(r.a, true)}x² ${sign(r.b, false)}x ${sign(r.c, false)}\n` +
    `a = ${r.a.toFixed(6)}\nb = ${r.b.toFixed(6)}\nc = ${r.c.toFixed(6)}`;
});
$('expRegBtn').addEventListener('click', () => {
  const [xs, ys] = readXY();
  const r = expRegression(xs, ys);
  if ('error' in r) return showRegError(r.error);
  $('regResult').textContent = `y = a · e^(bx)\na = ${r.a.toFixed(6)}\nb = ${r.b.toFixed(6)}`;
});

$('normCdfBtn').addEventListener('click', () => {
  const mu = +$<HTMLInputElement>('distMu').value;
  const sigma = +$<HTMLInputElement>('distSigma').value;
  const lo = +$<HTMLInputElement>('distLow').value;
  const hi = +$<HTMLInputElement>('distHigh').value;
  const p = normalCDF(hi, mu, sigma) - normalCDF(lo, mu, sigma);
  $('distResult').textContent = `normalcdf(${lo}, ${hi}, ${mu}, ${sigma})\n= ${p.toFixed(8)}`;
});
$('invNormBtn').addEventListener('click', () => {
  const mu = +$<HTMLInputElement>('distMu').value;
  const sigma = +$<HTMLInputElement>('distSigma').value;
  const p = +$<HTMLInputElement>('distLow').value;
  if (p <= 0 || p >= 1) {
    $('distResult').textContent = 'Area must be in (0,1)';
    return;
  }
  const x = invNorm(p, mu, sigma);
  $('distResult').textContent = `invNorm(${p}, ${mu}, ${sigma})\n= ${x.toFixed(8)}`;
});

function listResult(arr: number[]): void {
  $('listResult').textContent = '{' + arr.join(', ') + '}';
}
$('sortAscBtn').addEventListener('click', () => listResult(sortAsc(parseData($<HTMLTextAreaElement>('listData').value))));
$('sortDescBtn').addEventListener('click', () => listResult(sortDesc(parseData($<HTMLTextAreaElement>('listData').value))));
$('cumSumBtn').addEventListener('click', () => listResult(cumSum(parseData($<HTMLTextAreaElement>('listData').value))));
$('deltaBtn').addEventListener('click', () => listResult(deltaList(parseData($<HTMLTextAreaElement>('listData').value))));

// ============================
// MATRIX
// ============================
function buildMatrix(name: 'A' | 'B'): void {
  const rows = +$<HTMLInputElement>(name.toLowerCase() + 'Rows').value;
  const cols = +$<HTMLInputElement>(name.toLowerCase() + 'Cols').value;
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
      const prev = old[input.id];
      input.value = prev !== undefined ? prev : (r === c ? '1' : '0');
      grid.appendChild(input);
    }
  }
}

function readMatrix(name: 'A' | 'B'): Matrix {
  const rows = +$<HTMLInputElement>(name.toLowerCase() + 'Rows').value;
  const cols = +$<HTMLInputElement>(name.toLowerCase() + 'Cols').value;
  const M: Matrix = [];
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c++) {
      row.push(+$<HTMLInputElement>(`mat${name}_${r}_${c}`).value || 0);
    }
    M.push(row);
  }
  return M;
}

type MatOp = 'add' | 'sub' | 'mul' | 'det' | 'trans' | 'inv' | 'scalar' | 'rref' | 'trace';

function matOp(op: MatOp): void {
  const A = readMatrix('A');
  const B = readMatrix('B');
  let result = '';
  try {
    if (op === 'add')        result = showMatrix(matAdd(A, B));
    else if (op === 'sub')   result = showMatrix(matSub(A, B));
    else if (op === 'mul')   result = showMatrix(matMul(A, B));
    else if (op === 'det')   result = 'det(A) = ' + matDet(A).toFixed(6);
    else if (op === 'trans') result = showMatrix(matTrans(A));
    else if (op === 'inv') {
      const inv = matInv(A);
      result = inv ? showMatrix(inv) : 'Matrix not invertible';
    } else if (op === 'scalar') {
      const k = prompt('Enter scalar k:', '2');
      if (k === null) return;
      result = showMatrix(matScalar(A, +k));
    } else if (op === 'rref') {
      result = showMatrix(matRREF(A));
    } else if (op === 'trace') {
      result = 'tr(A) = ' + matTrace(A);
    }
  } catch (e) {
    result = 'Error: ' + (e instanceof Error ? e.message : String(e));
  }
  $('matrixResult').textContent = result;
}

['aRows', 'aCols'].forEach((id) => $<HTMLInputElement>(id).addEventListener('change', () => buildMatrix('A')));
['bRows', 'bCols'].forEach((id) => $<HTMLInputElement>(id).addEventListener('change', () => buildMatrix('B')));

document.querySelectorAll<HTMLButtonElement>('[data-matop]').forEach((btn) => {
  btn.addEventListener('click', () => matOp(btn.dataset.matop as MatOp));
});

// ============================
// INIT
// ============================
window.addEventListener('resize', () => {
  if ($('view-graph').classList.contains('active')) {
    resizeCanvas();
    render();
  }
});

renderFnList();
buildKeypad();
refreshCalc();
buildMatrix('A');
buildMatrix('B');
resizeCanvas();
setTimeout(() => { resizeCanvas(); render(); }, 100);
