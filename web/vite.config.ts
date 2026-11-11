import { defineConfig } from 'vitest/config';

// base './' so the built site works from any GitHub Pages sub-path
export default defineConfig({
  base: './',
  resolve: { preserveSymlinks: true },
  build: { target: 'es2020', chunkSizeWarningLimit: 900, rollupOptions: { input: { main: 'index.html', poster: 'poster.html' } } },
  test: { include: ['tests/unit/**/*.test.ts'] },
});
