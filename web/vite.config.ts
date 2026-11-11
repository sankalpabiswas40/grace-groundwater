import { defineConfig } from 'vitest/config';

// base './' so the built site works from any GitHub Pages sub-path
export default defineConfig({
  base: './',
  resolve: { preserveSymlinks: true },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
  test: { include: ['tests/unit/**/*.test.ts'] },
});
