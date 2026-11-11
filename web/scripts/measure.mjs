// Frame-time and download-size report. Run from web/ with the preview server on port 4173:
//   node scripts/measure.mjs
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }) // headless = software rendering, so fps here is a lower bound;
for (const cfg of [
  { name: 'FULL laptop 1440x900', tier: 'full', vp: { width: 1440, height: 900 }, dsf: 1, throttle: 1 },
  { name: 'LITE phone 390x844, 4x CPU slowdown', tier: 'lite', vp: { width: 390, height: 844 }, dsf: 2, throttle: 4 },
]) {
  const ctx = await browser.newContext({ viewport: cfg.vp, deviceScaleFactor: cfg.dsf });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  let bytes = 0;
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
  if (cfg.throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cfg.throttle });
  const t0 = Date.now();
  await page.goto(`http://localhost:4173/?tier=${cfg.tier}`);
  await page.waitForFunction(() => window.__ready === true);
  const ready = Date.now() - t0, first = bytes;
  const fps = async (sel) => {
    if (sel) await page.locator(sel).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    return page.evaluate(() => new Promise((res) => {
      let n = 0; const s = performance.now();
      const f = (t) => { n++; if (t - s < 3000) requestAnimationFrame(f); else res(Math.round((n / (t - s)) * 1000)); };
      requestAnimationFrame(f);
    }));
  };
  const hero = await fps(null);
  const sat = await fps('#sat-canvas');
  await page.locator('#map').scrollIntoViewIfNeeded();
  await page.waitForSelector('#map-svg path');
  await page.locator('#map-play').click();
  const map = await fps('#map-stage');
  for (const id of ['curve', 'methods', 'about']) { await page.locator('#' + id).scrollIntoViewIfNeeded(); await page.waitForTimeout(800); }
  const gpu = await page.evaluate(() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
  console.log(`${cfg.name}: ready ${ready} ms | first screen ${(first / 1e6).toFixed(2)} MB | whole page ${(bytes / 1e6).toFixed(2)} MB | fps hero ${hero}, satellites ${sat}, map playing ${map} | ${gpu}`);
  await ctx.close();
}
await browser.close();
