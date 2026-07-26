// Graph rendering, viewport math, and root-finding. The DOM-touching glue
// (event listeners, sidebar inputs, color palette) lives in main.ts.

import { compileGraphExpr, evalGraphExpr } from './parser.js';
import { niceStep, fmtNum } from './format.js';

export interface Window2D {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

export interface PlotFn {
  expr: string;
  color: string;
  enabled: boolean;
}

export interface Theme {
  bg: string;
  grid: string;
  axis: string;
  label: string;
}

export const DEFAULT_THEME: Theme = {
  bg: '#101728',
  grid: 'rgba(60,80,140,0.45)',
  axis: 'rgba(150,180,230,0.7)',
  label: 'rgba(170,190,230,0.7)',
};

export function worldToCanvas(wx: number, wy: number, w: Window2D, width: number, height: number): [number, number] {
  const cx = (wx - w.xmin) / (w.xmax - w.xmin) * width;
  const cy = (1 - (wy - w.ymin) / (w.ymax - w.ymin)) * height;
  return [cx, cy];
}

export function canvasToWorld(cx: number, cy: number, w: Window2D, width: number, height: number): [number, number] {
  const wx = w.xmin + (cx / width) * (w.xmax - w.xmin);
  const wy = w.ymax - (cy / height) * (w.ymax - w.ymin);
  return [wx, wy];
}

// Zoom around the center of the window by `factor` (0.5 = zoom in, 2 = zoom out).
export function zoomedWindow(w: Window2D, factor: number): Window2D {
  const cx = (w.xmin + w.xmax) / 2;
  const cy = (w.ymin + w.ymax) / 2;
  const hw = (w.xmax - w.xmin) / 2 * factor;
  const hh = (w.ymax - w.ymin) / 2 * factor;
  return { xmin: cx - hw, xmax: cx + hw, ymin: cy - hh, ymax: cy + hh };
}

// Make x and y units visually square based on the canvas aspect ratio.
// Preserves the current X range and the Y center; rescales Y to match.
export function squareWindow(w: Window2D, canvasWidth: number, canvasHeight: number): Window2D {
  if (canvasWidth <= 0 || canvasHeight <= 0) return w;
  const cx = (w.xmin + w.xmax) / 2;
  const cy = (w.ymin + w.ymax) / 2;
  const hw = (w.xmax - w.xmin) / 2;
  const hh = hw * (canvasHeight / canvasWidth);
  return { xmin: cx - hw, xmax: cx + hw, ymin: cy - hh, ymax: cy + hh };
}

export function panWindow(w: Window2D, dx: number, dy: number): Window2D {
  return { xmin: w.xmin - dx, xmax: w.xmax - dx, ymin: w.ymin - dy, ymax: w.ymax - dy };
}

export interface DrawOpts {
  trace?: { fnIndex: number; x: number } | null;
  theme?: Theme;
}

function tickValues(min: number, max: number, step: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || step <= 0) return [];
  const first = Math.ceil(min / step);
  const last = Math.floor(max / step);
  const count = last - first + 1;
  if (!Number.isFinite(first) || !Number.isFinite(last) || !Number.isSafeInteger(count)
      || count < 1 || count > 2_000) return [];
  return Array.from({ length: count }, (_, index) => (first + index) * step)
    .filter(Number.isFinite);
}

export function drawGraph(ctx: CanvasRenderingContext2D, fns: PlotFn[], w: Window2D, opts: DrawOpts = {}): void {
  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;
  if (width === 0 || height === 0) return;
  const theme = opts.theme || DEFAULT_THEME;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, height);

  // Grid — iterate by integer index so accumulated float error doesn't
  // silently drop the last tick on ranges whose step doesn't divide evenly.
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  const xStep = niceStep(w.xmax - w.xmin);
  const yStep = niceStep(w.ymax - w.ymin);
  const xTicks = tickValues(w.xmin, w.xmax, xStep);
  const yTicks = tickValues(w.ymin, w.ymax, yStep);
  for (const gx of xTicks) {
    const [cx] = worldToCanvas(gx, 0, w, width, height);
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, height); ctx.stroke();
  }
  for (const gy of yTicks) {
    const [, cy] = worldToCanvas(0, gy, w, width, height);
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(width, cy); ctx.stroke();
  }

  // Axes
  ctx.strokeStyle = theme.axis;
  ctx.lineWidth = 1.5;
  const [ax] = worldToCanvas(0, 0, w, width, height);
  const [, ay] = worldToCanvas(0, 0, w, width, height);
  ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, height); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, ay); ctx.lineTo(width, ay); ctx.stroke();

  // Tick labels
  ctx.fillStyle = theme.label;
  ctx.font = '10px "Share Tech Mono", monospace';
  for (const gx of xTicks) {
    if (Math.abs(gx) < xStep / 1000) continue;
    const [cx] = worldToCanvas(gx, 0, w, width, height);
    ctx.fillText(fmtNum(gx), cx + 3, Math.min(Math.max(ay + 12, 12), height - 3));
  }
  for (const gy of yTicks) {
    if (Math.abs(gy) < yStep / 1000) continue;
    const [, cy] = worldToCanvas(0, gy, w, width, height);
    ctx.fillText(fmtNum(gy), Math.min(Math.max(ax + 4, 0), width - 40), cy - 3);
  }

  // Plot each enabled function
  const steps = width * 2;
  const yRange = w.ymax - w.ymin;
  for (const fn of fns) {
    if (!fn.enabled || !fn.expr.trim()) continue;
    const evaluate = compileGraphExpr(fn.expr);
    ctx.strokeStyle = fn.color;
    ctx.lineWidth = 2;
    ctx.shadowColor = fn.color;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    let prevValid = false;
    let prevY: number | null = null;
    for (let i = 0; i <= steps; i++) {
      const wx = w.xmin + (i / steps) * (w.xmax - w.xmin);
      const wy = evaluate(wx);
      if (Number.isNaN(wy) || !isFinite(wy)) { prevValid = false; prevY = null; continue; }
      const [cx, cy] = worldToCanvas(wx, wy, w, width, height);
      // Detect probable asymptote: huge jump with sign flip.
      let breakLine = false;
      if (prevValid && prevY !== null) {
        const jump = Math.abs(wy - prevY);
        if (jump > yRange * 10 && prevY * wy < 0) breakLine = true;
      }
      if (!prevValid || breakLine) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
      prevValid = true;
      prevY = wy;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Trace marker on top of everything
  if (opts.trace && fns[opts.trace.fnIndex]) {
    const fn = fns[opts.trace.fnIndex]!;
    const wy = compileGraphExpr(fn.expr)(opts.trace.x);
    if (!Number.isNaN(wy) && isFinite(wy)) {
      const [cx, cy] = worldToCanvas(opts.trace.x, wy, w, width, height);
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = fn.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

// Find sampled sign-change and tangent zeros within [xmin, xmax]. Sign changes
// are refined with bisection; local minima of |f| are refined with a bounded
// golden-section search so even-multiplicity roots can be detected too.
export function findZeros(expr: string, xmin: number, xmax: number, steps = 2000): number[] {
  const zeros: number[] = [];
  if (!expr.trim() || !(xmax > xmin) || !Number.isFinite(xmin) || !Number.isFinite(xmax)
      || !Number.isInteger(steps) || steps < 2) return zeros;
  const evaluate = compileGraphExpr(expr);
  const dx = (xmax - xmin) / steps;
  // Bisection requires sign-change samples on both sides; an exact root *at*
  // a search-window boundary (e.g. sin(x) at ±π) won't qualify because the
  // algorithm never sees the other side. Catch those explicitly.
  const yAtMin = evaluate(xmin);
  if (yAtMin === 0) {
    zeros.push(xmin);
  }
  let prevX = xmin;
  let prevY = yAtMin;
  let beforePrevX = xmin;
  let beforePrevY = NaN;
  for (let i = 1; i <= steps; i++) {
    const x = xmin + i * dx;
    const y = evaluate(x);
    if (!Number.isNaN(y) && isFinite(y)) {
      if (y === 0 && prevY !== 0) {
        // Isolated exact zero. Require prev sample to be non-zero so an
        // identically-zero function doesn't emit one "zero" per sample.
        if (!zeros.some((z) => Math.abs(z - x) < dx * 2)) zeros.push(x);
      } else if (!Number.isNaN(prevY) && isFinite(prevY) && prevY !== 0
          && ((prevY < 0 && y > 0) || (prevY > 0 && y < 0))) {
        let lo = prevX, hi = x;
        let ylo = prevY;
        for (let j = 0; j < 60; j++) {
          const mid = (lo + hi) / 2;
          const ym = evaluate(mid);
          if (Number.isNaN(ym) || !isFinite(ym)) break;
          if (ym === 0 || (ylo < 0 && ym > 0) || (ylo > 0 && ym < 0)) { hi = mid; }
          else { lo = mid; ylo = ym; }
          if (Math.abs(hi - lo) < Math.max(1, Math.abs(mid)) * 1e-13) break;
        }
        const zx = (lo + hi) / 2;
        const yAtZero = evaluate(zx);
        const localScale = Math.min(Math.abs(prevY), Math.abs(y));
        if (Number.isFinite(yAtZero) && localScale > 0 && Math.abs(yAtZero) <= localScale * 1e-6) {
          if (!zeros.some((z) => Math.abs(z - zx) < dx * 2)) zeros.push(zx);
        }
      }

      // A local minimum of |f| can be a tangent root. Refine the previous
      // sample only when both neighboring samples are finite and larger.
      if (Number.isFinite(beforePrevY) && Number.isFinite(prevY)
          && Math.abs(prevY) < Math.abs(beforePrevY) && Math.abs(prevY) < Math.abs(y)) {
        let lo = beforePrevX, hi = x;
        const phi = (Math.sqrt(5) - 1) / 2;
        let c = hi - phi * (hi - lo), d = lo + phi * (hi - lo);
        let fc = Math.abs(evaluate(c)), fd = Math.abs(evaluate(d));
        for (let j = 0; j < 70 && Number.isFinite(fc) && Number.isFinite(fd); j++) {
          if (fc <= fd) { hi = d; d = c; fd = fc; c = hi - phi * (hi - lo); fc = Math.abs(evaluate(c)); }
          else { lo = c; c = d; fc = fd; d = lo + phi * (hi - lo); fd = Math.abs(evaluate(d)); }
        }
        const zx = (lo + hi) / 2;
        const residual = Math.abs(evaluate(zx));
        const localScale = Math.max(Math.abs(beforePrevY), Math.abs(y));
        if (Number.isFinite(residual) && localScale > 0 && residual <= localScale * 1e-8
            && !zeros.some((z) => Math.abs(z - zx) < dx * 2)) zeros.push(zx);
      }
    }
    beforePrevX = prevX;
    beforePrevY = prevY;
    prevX = x;
    prevY = y;
  }
  // Symmetric boundary check at xmax.
  const yAtMax = evaluate(xmax);
  if (yAtMax === 0
      && !zeros.some((z) => Math.abs(z - xmax) < dx * 2)) {
    zeros.push(xmax);
  }
  return zeros.sort((a, b) => a - b);
}
