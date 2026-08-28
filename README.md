# GraphCalc

A browser-based graphing, scientific, statistics, and matrix calculator — all in one page.

Live: https://curtisalexander.github.io/gc/

## Features

**Graphing**
- Multiple functions, color-coded
- Pan (drag) and zoom (scroll); standard / square window presets
- Trace mode — hover to read off `(x, y)` on the first function
- Sampled zero finder for sign-change and tangent-root candidates, with discontinuity heuristics
- Implicit multiplication (`2x`, `3sin(x)`, `(x-1)(x+1)`) and TI-style power
  precedence (`-3^2 = -9`, right-associative `2^3^2 = 512`)

**Scientific Calculator**
- Degree / radian modes, 2nd-function shift
- Trig, inverse trig, logs, square root, abs, factorial, percent
- nCr, nPr, scientific notation, ANS recall
- Keyboard input

**Statistics**
- 1-variable summary stats (mean, sample/population stddev, quartiles, IQR)
- Linear regression with r and r²; quadratic and exponential regression
- Normal CDF and inverse normal
- Sort / cumulative sum / first differences

**Matrix**
- Up to 5×5: add, subtract, multiply, scalar multiply
- Determinant, transpose, trace
- Inverse and reduced row-echelon form

## Using GraphCalc

GraphCalc starts with examples in each tool so you can see the expected input
shape. Replace those values with your own; invalid or missing values are reported
instead of being silently ignored or changed to zero.

### Graphing

Enter an expression in `x`, such as:

```text
sin(x)
(x-1)(x+1)
e^(-x^2/2)
```

Graph expressions always use **radians**. Both `2*x` and implicit multiplication
such as `2x`, `3sin(x)`, and `(x-1)(x+1)` are accepted. Use the `?` button for
the complete syntax guide. Drag with a mouse, pen, or finger to pan; use the
wheel or the Zoom buttons to zoom. With the graph focused, arrow keys pan,
`+`/`-` zoom, and `T` toggles trace.

The zero finder is numerical and sampling-based. It detects sampled sign changes
and many tangent-root candidates, but no finite sampler can guarantee every root
of an arbitrary function. Closely spaced roots may be missed, and discontinuity
rejection is heuristic, so a candidate near a discontinuity should be checked.
“No zeros detected” is not a mathematical proof that none exist.

### Scientific calculator

The calculator starts in **DEG** mode; select **RAD** for radian arguments.
Examples:

```text
sin(30)       → 0.5 in DEG mode
sin(pi/6)     → 0.5 in RAD mode
nCr(10, 3)    → 120
2.5 EE -4     → 0.00025
```

`2ND` applies to the next key only. `ANS` inserts the previous successful
answer. `%` means divide the preceding value by 100, so `50% = 0.5` and
`200*10% = 20`; it does **not** implement the relative-percent convention where
`200+10%` means 220. Supported keyboard keys are digits, `+ - * / . ^ ( ) ,`,
Enter/`=`, Backspace, and Escape.

### Statistics and distributions

Lists accept finite numbers separated by commas, spaces, semicolons, or newlines.
Every token must be valid. Regression X and Y lists must have the same number of
entries, in matching order.

- `Sx` is sample standard deviation (denominator `n-1`) and is undefined for one
  value; `σx` is population standard deviation (denominator `n`).
- Q1 and Q3 use the exclusive-median convention: for odd-sized datasets, the
  overall median is excluded from both halves.
- Exponential regression fits `ln(y) = ln(a) + bx`, so all Y values must be
  positive and residuals are minimized in log space.
- `normalcdf` takes lower bound, upper bound, mean, and a positive standard
  deviation.
- `invNorm` takes a left-tail probability strictly between 0 and 1, mean, and a
  positive standard deviation.

### Matrices

Matrix dimensions must be whole numbers from 1 through 5. Every visible cell is
required and must contain a finite number. `A+B` and `A−B` require equal shapes;
`A×B` requires the number of columns of A to equal the number of rows of B;
determinant, inverse, and trace require a square A. Enter `k` in the Scalar field
before selecting `kA`.

Results use significant-digit formatting and scientific notation where needed.
Calculations use JavaScript's IEEE-754 double-precision arithmetic, so ordinary
floating-point limits still apply; displayed digits should not be interpreted as
arbitrary-precision guarantees.

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
to test in Node, and what would let them be reused outside the browser if 
ever desired. `main.ts` is the only file that touches the DOM.

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

Two execution layers, with deterministic property, accessibility, touch, and
visual-regression coverage:

- **Unit tests** (`tests/`, Vitest): cover the math modules in isolation. Seeded
  `fast-check` properties generate reproducible expression, matrix, regression,
  and distribution cases; `decimal.js`, exact formulas, and published normal
  probabilities provide references independent of the production algorithms.
- **End-to-end tests** (`e2e/`, Playwright): boot Vite, drive each tab at desktop
  and mobile sizes, check happy paths and invalid-input behavior, exercise
  keyboard and real touch input, run Axe accessibility scans, and compare the
  UI with committed desktop/mobile visual baselines. Uncaught page and console
  errors fail the suite.

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
- **Generated properties**: nested arithmetic against high-precision Decimal,
  compiled/direct graph agreement, transpose/product and determinant identities,
  two-sided inverse checks, RREF idempotence, translated/scaled regressions,
  and normal-CDF monotonicity, symmetry, tails, and published reference values.
- **Browser quality**: Axe scans every tool, verifies focus and ARIA state,
  performs a Chromium touch drag and tap, and protects approved layouts with
  Playwright screenshot comparisons.

### Screenshots

Review screenshots are produced as a side-effect of the e2e suite. PNGs land
in `e2e/screenshots/` (gitignored), one per spec, named `01-graph.png`,
`02-graph-help.png`, etc. Approved comparison baselines are committed under
`e2e/quality.spec.ts-snapshots/`. The visual comparisons run in Linux CI, where
ordinary test runs fail when the rendered UI differs beyond the configured
tolerance; they are skipped on other operating systems because browser text
rendering is platform-specific.

```bash
# First-time setup (downloads ~90 MB Chromium binary)
npx playwright install chromium

# Take all screenshots (also runs the assertions)
npm run e2e

# Deliberately approve a reviewed visual change (Linux)
npx playwright test e2e/quality.spec.ts --update-snapshots=all

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
