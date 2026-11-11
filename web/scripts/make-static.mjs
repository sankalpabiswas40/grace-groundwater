// Renders the hero once in a headless browser and saves it as the STATIC-tier image.
// Run from web/:  node scripts/make-static.mjs   (needs "npm run preview" or the dev server on port 4173)
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto('http://localhost:4173/?tier=full');
await page.waitForFunction(() => window.__ready === true);
await page.addStyleTag({ content: '.hero-text,.topbar,.hero-badge,.scroll-cue{visibility:hidden!important}' });
await page.waitForTimeout(2500);
await page.locator('#hero-canvas').screenshot({ path: 'public/static/hero.jpg', type: 'jpeg', quality: 78 });
await browser.close();
console.log('wrote public/static/hero.jpg');
