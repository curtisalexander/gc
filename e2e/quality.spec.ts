import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => { throw error; });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
});

test('all calculator views have no automatically detectable accessibility violations', async ({ page }) => {
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  for (const tab of ['graph', 'calc', 'stats', 'matrix']) {
    await page.locator(`#tab-${tab}`).click();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, results.violations.map(violation =>
      `${violation.id}: ${violation.help}\n${violation.nodes.map(node => node.target.join(' ')).join('\n')}`,
    ).join('\n\n')).toEqual([]);
  }
});

test('help, mode controls, generated inputs, and syntax errors expose state', async ({ page }) => {
  const helpButton = page.locator('#helpBtn');
  await helpButton.click();
  await expect(page.locator('#helpCloseBtn')).toBeFocused();
  await expect(helpButton).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(helpButton).toBeFocused();
  await expect(helpButton).toHaveAttribute('aria-expanded', 'false');

  const colorButton = page.locator('.fn-color').first();
  const originalColor = await colorButton.evaluate(element => getComputedStyle(element).backgroundColor);
  await colorButton.focus();
  await page.keyboard.press('Enter');
  await expect(colorButton).not.toHaveCSS('background-color', originalColor);

  const expression = page.locator('.fn-input').first();
  await expression.fill('sqrt((');
  await expect(expression).toHaveAttribute('aria-invalid', 'true');
  await expression.fill('sqrt(x)');
  await expect(expression).toHaveAttribute('aria-invalid', 'false');

  await page.locator('#tab-calc').click();
  await page.locator('#modeRad').click();
  await expect(page.locator('#modeRad')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#modeDeg')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#shiftBtn').click();
  await expect(page.locator('#shiftBtn')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#tab-matrix').click();
  await expect(page.getByRole('spinbutton', { name: 'Matrix A, row 1, column 1' })).toBeVisible();
  await expect(page.locator('#matrixResult')).toHaveAttribute('aria-live', 'polite');
});

test.describe('touch interactions', () => {
  test.use({ hasTouch: true });

  test('dragging pans the graph and trace remains touch-operable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#traceBtn').tap();
    await expect(page.locator('#traceBtn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#traceInfo')).toBeVisible();
    await page.locator('#traceBtn').tap();

    const canvas = page.locator('#graphCanvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Graph canvas has no bounding box');
    const client = await page.context().newCDPSession(page);
    const start = { x: box.x + box.width * 0.35, y: box.y + box.height * 0.5 };
    const end = { x: box.x + box.width * 0.65, y: box.y + box.height * 0.5 };
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ ...start, radiusX: 2, radiusY: 2, force: 1 }],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ ...end, radiusX: 2, radiusY: 2, force: 1 }],
    });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('#xmin')).not.toHaveValue('-10');
  });
});

test('approved desktop views retain their visual layout', async ({ page }) => {
  for (const tab of ['graph', 'calc', 'stats', 'matrix']) {
    await page.locator(`#tab-${tab}`).click();
    await expect(page).toHaveScreenshot(`desktop-${tab}.png`, {
      animations: 'disabled', fullPage: true, maxDiffPixelRatio: 0.005,
    });
  }
});

test('approved mobile graph retains its visual layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page).toHaveScreenshot('mobile-graph.png', {
    animations: 'disabled', fullPage: true, maxDiffPixelRatio: 0.005,
  });
});
