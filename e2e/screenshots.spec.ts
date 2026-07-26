import { test, expect } from '@playwright/test';

// Drive each tab and snap a screenshot. PNGs land in e2e/screenshots/ so a
// human (or Claude) can eyeball the result without running the dev server.
//
// These tests double as smoke tests: if the page throws on load or an event
// handler is wired wrong, the assertions and the screenshot step fail.

const SHOTS = 'e2e/screenshots';

test.beforeEach(async ({ page }) => {
  // Surface page errors as test failures.
  page.on('pageerror', (err) => { throw err; });
  page.on('console', (msg) => {
    if (msg.type() === 'error') throw new Error(`console error: ${msg.text()}`);
  });
  await page.goto('/');
  // Wait for the canvas-driven graph render to settle so the screenshot is stable.
  await page.waitForTimeout(300);
});

test('graph view renders default functions', async ({ page }) => {
  await expect(page.locator('#view-graph')).toBeVisible();
  await expect(page.locator('canvas#graphCanvas')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/01-graph.png`, fullPage: true });
});

test('graph view: syntax help', async ({ page }) => {
  await page.locator('#helpBtn').click();
  await expect(page.locator('#syntaxHelp')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/02-graph-help.png`, fullPage: true });
});

test('graph view: zoom in', async ({ page }) => {
  await page.locator('#zoomInBtn').click();
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${SHOTS}/03-graph-zoomed.png`, fullPage: true });
  // After zoom, X range should have shrunk from -10..10 to -5..5.
  const xmin = await page.locator('#xmin').inputValue();
  const xmax = await page.locator('#xmax').inputValue();
  expect(parseFloat(xmin)).toBeCloseTo(-5, 3);
  expect(parseFloat(xmax)).toBeCloseTo(5, 3);
});

test('graph view: find zeros of sin(x)', async ({ page }) => {
  // Replace the first function with sin(x) (it already is) and ask for zeros.
  await page.locator('#zeroBtn').click();
  await expect(page.locator('#coordBox')).toContainText('Candidate');
  await page.screenshot({ path: `${SHOTS}/04-graph-zeros.png`, fullPage: true });
});

test('calculator view: basic evaluation 2 + 3 =', async ({ page }) => {
  await page.locator('.tab[data-tab="calc"]').click();
  await expect(page.locator('#view-calc')).toBeVisible();
  // Click '2', '+', '3', '='
  await page.locator('.key', { hasText: /^2$/ }).first().click();
  await page.locator('.key.op', { hasText: '+' }).click();
  await page.locator('.key', { hasText: /^3$/ }).first().click();
  await page.locator('.key.eq').click();
  await expect(page.locator('#calcResult')).toHaveText('5');
  await page.screenshot({ path: `${SHOTS}/05-calc-basic.png`, fullPage: true });
});

test('calculator view: sin(30) in degrees', async ({ page }) => {
  await page.locator('.tab[data-tab="calc"]').click();
  // Mode defaults to DEG. Press sin, 30, ), =.
  await page.locator('.key.fn', { hasText: 'sin' }).click();
  await page.locator('.key', { hasText: /^3$/ }).first().click();
  await page.locator('.key', { hasText: /^0$/ }).first().click();
  await page.locator('.key.fn', { hasText: '( )' }).click(); // closes since one open
  await page.locator('.key.eq').click();
  await expect(page.locator('#calcResult')).toHaveText('0.5');
  await page.screenshot({ path: `${SHOTS}/06-calc-sin30.png`, fullPage: true });
});

test('stats view: 1-var stats on default data', async ({ page }) => {
  await page.locator('.tab[data-tab="stats"]').click();
  await expect(page.locator('#view-stats')).toBeVisible();
  await page.locator('#calc1VarBtn').click();
  await expect(page.locator('#stat1Results')).toContainText('x̄');
  // Default data is 2,4,6,8,10 → mean 6
  await expect(page.locator('#stat1Results')).toContainText('6');
  await page.screenshot({ path: `${SHOTS}/07-stats-1var.png`, fullPage: true });
});

test('stats view: linear regression on near-perfect data', async ({ page }) => {
  await page.locator('.tab[data-tab="stats"]').click();
  await page.locator('#linRegBtn').click();
  await expect(page.locator('#regResult')).toContainText('y = a + bx');
  await page.screenshot({ path: `${SHOTS}/08-stats-linreg.png`, fullPage: true });
});

test('matrix view: A + B with default identities', async ({ page }) => {
  await page.locator('.tab[data-tab="matrix"]').click();
  await expect(page.locator('#view-matrix')).toBeVisible();
  await page.locator('[data-matop="add"]').click();
  // Default A and B are identity matrices, so A+B = 2I
  await expect(page.locator('#matrixResult')).toContainText('2');
  await page.screenshot({ path: `${SHOTS}/09-matrix-add.png`, fullPage: true });
});

test('matrix view: determinant of A', async ({ page }) => {
  await page.locator('.tab[data-tab="matrix"]').click();
  await page.locator('[data-matop="det"]').click();
  await expect(page.locator('#matrixResult')).toContainText('det(A) = 1');
  await page.screenshot({ path: `${SHOTS}/10-matrix-det.png`, fullPage: true });
});

test('invalid input is rejected instead of silently changing data', async ({ page }) => {
  await page.locator('.tab[data-tab="stats"]').click();
  await page.locator('#calc1VarBtn').click();
  await expect(page.locator('#stat1Results')).toContainText('x̄');
  await page.locator('#statData1').fill('1, invalid, 2');
  await page.locator('#calc1VarBtn').click();
  await expect(page.locator('#stat1Results')).toContainText('Invalid numeric token 2');
  await expect(page.locator('#stat1Results')).not.toContainText('x̄');

  await page.locator('#distSigma').fill('-1');
  await page.locator('#normCdfBtn').click();
  await expect(page.locator('#distResult')).toContainText('greater than zero');

  await page.locator('.tab[data-tab="matrix"]').click();
  await page.locator('#matA_0_0').fill('');
  await page.locator('[data-matop="det"]').click();
  await expect(page.locator('#matrixResult')).toContainText('row 1, column 1 is required');
});

test('graph validates its window and supports keyboard controls', async ({ page }) => {
  await page.locator('#xmax').fill('-20');
  await page.locator('#xmax').press('Tab');
  await expect(page.locator('#windowError')).toContainText('X minimum must be less than X maximum');
  await page.locator('#stdWinBtn').click();
  await page.locator('#graphCanvas').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#xmin')).toHaveValue('-12');
  await expect(page.locator('#xmax')).toHaveValue('8');
  await page.locator('#xmin').fill('-1e308');
  await page.locator('#xmax').fill('1e308');
  await page.locator('#xmax').press('Tab');
  await expect(page.locator('#windowError')).toContainText('outside the supported numeric range');
});

test('tabs expose state and support arrow-key navigation', async ({ page }) => {
  const graphTab = page.locator('#tab-graph');
  await expect(graphTab).toHaveAttribute('aria-selected', 'true');
  await graphTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tab-calc')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#view-calc')).toBeVisible();
});

test('editing inputs invalidates stale results in every tool', async ({ page }) => {
  await page.locator('#zeroBtn').click();
  await expect(page.locator('#coordBox')).toContainText('Candidate');
  await page.locator('.fn-input').first().fill('cos(x)');
  await expect(page.locator('#coordBox')).toContainText('Function changed');

  await page.locator('.tab[data-tab="stats"]').click();
  await page.locator('#calc1VarBtn').click();
  await page.locator('#statData1').fill('1, 2, 3');
  await expect(page.locator('#stat1Results')).toHaveText('Inputs changed — recalculate');

  await page.locator('#linRegBtn').click();
  await page.locator('#statDataX').fill('1, 2, 3');
  await expect(page.locator('#regResult')).toHaveText('Inputs changed — recalculate');

  await page.locator('#normCdfBtn').click();
  await page.locator('#distMu').fill('1');
  await expect(page.locator('#distResult')).toHaveText('Inputs changed — recalculate');

  await page.locator('#sortAscBtn').click();
  await page.locator('#listData').fill('2, 1');
  await expect(page.locator('#listResult')).toHaveText('Inputs changed — recalculate');

  await page.locator('.tab[data-tab="matrix"]').click();
  await page.locator('[data-matop="det"]').click();
  await page.locator('#matA_0_0').fill('2');
  await expect(page.locator('#matrixResult')).toHaveText('Inputs changed — select an operation');
});

test('mobile views fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tab of ['graph', 'calc', 'stats', 'matrix']) {
    await page.locator(`.tab[data-tab="${tab}"]`).click();
    const width = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(width.scroll).toBeLessThanOrEqual(width.client);
  }
  await page.locator('.tab[data-tab="graph"]').click();
  await page.screenshot({ path: `${SHOTS}/11-mobile-graph.png`, fullPage: true });
});
