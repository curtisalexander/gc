// Number formatting helpers shared across views.

// Choose a "nice" axis tick step (1, 2, 5, 10, ...) that gives ~8 ticks across
// the supplied range. Used by the graph view to pick gridline spacing.
export function niceStep(range: number): number {
  if (!isFinite(range) || range <= 0) return 1;
  const raw = range / 8;
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  const normed = raw / base;
  if (normed < 1.5) return base;
  if (normed < 3.5) return 2 * base;
  if (normed < 7.5) return 5 * base;
  return 10 * base;
}

// Compact axis-label formatter: integers as-is, otherwise 3 sig figs.
export function fmtNum(n: number): string {
  if (!isFinite(n)) return n > 0 ? '∞' : '−∞';
  if (Number.isInteger(n)) return n.toString();
  return parseFloat(n.toPrecision(3)).toString();
}

// Calculator result formatter: scientific for very large/small, fixed otherwise.
export function formatResult(n: number): string {
  if (Number.isNaN(n)) return 'Error';
  if (!isFinite(n)) return n > 0 ? '+∞' : '−∞';
  if (Math.abs(n) < 1e-10 && n !== 0) return n.toExponential(6);
  if (Math.abs(n) >= 1e10) return n.toExponential(6);
  const str = n.toPrecision(10);
  return parseFloat(str).toString();
}
