# GraphCalc

A browser-based graphing calculator modeled on a Texas Instruments graphing
calculator. Plotter, scientific calculator, statistics, and matrix tools — all
in one page.

Live: https://calex.github.io/gc/ (after Pages deploy)

## Features

**Graphing**
- Multiple functions, color-coded
- Pan (drag) and zoom (scroll); standard / square window presets
- Trace mode — hover to read off `(x, y)` on the first function
- Numerical zero finder with asymptote rejection
- Implicit multiplication (`2x`, `3sin(x)`, `(x-1)(x+1)`) and TI-style power
  precedence (`-3^2 = -9`, right-associative `2^3^2 = 512`)

**Scientific Calculator**
- Degree / radian modes, 2nd-function shift
- Trig, inverse trig, logs, square root, abs, factorial, percent
- nCr, nPr, scientific notation, ANS recall
- Keyboard input

**Statistics**
- 1-variable summary stats (mean, sample/population stddev, quartiles, IQR)
- Linear, quadratic, exponential regression with r²
- Normal CDF and inverse normal
- Sort / cumulative sum / first differences

**Matrix**
- Up to 5×5: add, subtract, multiply, scalar multiply
- Determinant, transpose, trace
- Inverse and reduced row-echelon form

## Project layout

```
.
├── index.html              # Vite entry; references /src/main.ts
├── src/
│   ├── main.ts             # DOM wiring, event handlers
│   ├── styles.css
│   ├── parser.ts           # math expression evaluator (graph + calc)
│   ├── graphing.ts         # plot, viewport math, root-finding
│   ├── calculator.ts       # scientific calculator state machine
│   ├── statistics.ts       # 1-var, regression, normal distribution
│   ├── matrix.ts           # add/sub/mul/det/inv/rref
│   └── format.ts           # number formatting helpers
├── tests/
│   ├── parser.test.ts
│   ├── calculator.test.ts
│   ├── statistics.test.ts
│   ├── matrix.test.ts
│   └── graphing.test.ts
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .github/workflows/pages.yml
```

The math modules (`parser`, `graphing`, `calculator`, `statistics`, `matrix`,
`format`) are all pure TypeScript — no DOM access. That's what makes them easy
to test in Node, and what would let them be reused outside the browser if you
ever wanted to. `main.ts` is the only file that touches the DOM.

## Development

```bash
npm install         # one-time
npm run dev         # local dev server with HMR (http://localhost:5173)
npm test            # unit tests (vitest)
npm run test:watch  # unit tests in watch mode
npm run e2e         # Playwright end-to-end tests + screenshots
npm run e2e:ui      # Playwright with the UI runner
npm run build       # type-check then produce dist/ for deploy
npm run preview     # serve dist/ locally to verify the production build
```

First run of `npm run e2e` requires `npx playwright install chromium` to fetch
the browser binary (~90 MB).

## Tests

Two layers:

- **Unit tests** (`tests/`, vitest, ~117 tests): cover the math modules in
  isolation. Fast (~250ms).
- **End-to-end tests** (`e2e/`, Playwright): boot Vite, drive each tab in a
  headless browser, and snap screenshots into `e2e/screenshots/`. Doubles as
  smoke tests — assertions check that operations produce the expected result
  in the rendered DOM, and `pageerror`/console-error listeners fail the test
  on any uncaught script error.

Unit-test highlights:

- **Parser**: arithmetic, implicit multiplication (`2x`, `(x-1)(x+1)`, `xx`,
  `xpi`), TI-style power precedence, trig/inverse-trig, logs, scientific
  notation vs the `e` constant, error handling.
- **Calculator**: keypad state machine, ANS, shift mode, angle modes,
  factorials, error recovery.
- **Statistics**: parsing, mean / median / quartiles, regression for known
  perfect fits, normal CDF round-trip, Gaussian elimination.
- **Matrix**: add/sub/mul/det/inv/rref/trace, including A·A⁻¹ = I checks and
  singular detection.
- **Graphing**: viewport math, `findZeros` (including asymptote rejection),
  `squareWindow` regression test.

### Screenshots

Screenshots are produced as a side-effect of the e2e suite. PNGs land in
`e2e/screenshots/` (gitignored), one per spec, named `01-graph.png`,
`02-graph-help.png`, etc.

```bash
# First-time setup (downloads ~90 MB Chromium binary)
npx playwright install chromium

# Take all screenshots (also runs the assertions)
npm run e2e

# Single test by name
npx playwright test -g "find zeros"

# Interactive runner — pick tests, see traces, debug
npm run e2e:ui

# Open the last HTML report after a failure
npx playwright show-report
```

To add a new screenshot, add a `test('...', async ({ page }) => { ... })`
block to `e2e/screenshots.spec.ts` and call `page.screenshot({ path:
'${SHOTS}/NN-name.png', fullPage: true })`.

In CI, the `playwright-screenshots` artifact is attached to every Pages
workflow run (success or failure), so you can download the PNGs from the
Actions tab to review what visitors will see before the deploy goes live.

## Deployment

Pushing to `main` triggers `.github/workflows/pages.yml`, which:

1. Installs deps (`npm ci`)
2. Runs unit tests (`npm test`)
3. Installs Chromium and runs the Playwright e2e suite (`npm run e2e`)
4. Type-checks and builds with Vite (`npm run build`)
5. Uploads `dist/` and deploys to GitHub Pages
6. Uploads `e2e/screenshots/` as a workflow artifact

The build is configured with `base: './'` so it works under any Pages subpath.

## License

MIT
