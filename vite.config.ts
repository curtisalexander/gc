/// <reference types="vitest" />
import { defineConfig } from 'vite';

// Vite serves index.html at the project root and bundles src/main.ts via the
// <script type="module"> reference inside it. `base: './'` keeps assets relative
// so the build works under any GitHub Pages subpath.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
