// Renders the A1 poster to poster/poster_A1.pdf and poster/poster_A1_300dpi.png.
// Run from web/ with "npm run build" done and "npm run preview" serving port 4173:
//   node scripts/make-poster.mjs
import { chromium } from '@playwright/test';
const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args });
const base = 'http://localhost:4173/';

if (!process.argv.includes('--skip-hero')) {
  // 1. Earth artwork for the title band, rendered from the site's own hero scene (NASA textures and model)
  const hero = await browser.newPage({ viewport: { width: 2245, height: 650 }, deviceScaleFactor: 3 });
  await hero.goto(base + '?tier=full');
  await hero.waitForFunction(() => window.__ready === true);
  await hero.waitForFunction(() => window.__satModel === 'nasa', null, { timeout: 30000 });
  await hero.addStyleTag({ content: '.hero-text,.topbar,.hero-badge,.scroll-cue{visibility:hidden!important}.hero{min-height:650px;height:650px}' });
  await hero.waitForTimeout(4000);
  await hero.locator('#hero-canvas').screenshot({ path: 'public/static/poster-hero.jpg', type: 'jpeg', quality: 88 });
  await hero.close();
  console.log('wrote public/static/poster-hero.jpg (rebuild before rendering the poster)');
}
if (!process.argv.includes('--hero-only')) {
  // 2. PDF (vector text and figures)
  const pdf = await browser.newPage({ viewport: { width: 2245, height: 3179 } });
  await pdf.goto(base + 'poster.html');
  await pdf.waitForFunction(() => window.__posterReady === true, null, { timeout: 60000 });
  await pdf.waitForTimeout(800);
  await pdf.pdf({ path: '../poster/poster_A1.pdf', width: '594mm', height: '841mm', printBackground: true, pageRanges: '1' });
  await pdf.close();
  // 3. PNG at 300 dpi (7016 x 9934 px). A single screenshot this tall exceeds the browser's
  //    image limit and wraps around, so render horizontal strips and stitch them.
  const DSF = 3.125, VW = 2245, VH = 3179, STRIPS = 6;
  const png = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: DSF });
  await png.goto(base + 'poster.html');
  await png.waitForFunction(() => window.__posterReady === true, null, { timeout: 60000 });
  await png.waitForTimeout(800);
  const sharp = (await import('sharp')).default;
  const parts = [];
  const stripH = Math.ceil(VH / STRIPS);
  for (let k = 0; k < STRIPS; k++) {
    const y = k * stripH, h = Math.min(stripH, VH - y);
    const buf = await png.screenshot({ clip: { x: 0, y, width: VW, height: h } });
    const meta = await sharp(buf).metadata();
    parts.push({ input: buf, left: 0, top: Math.round(y * DSF), h: meta.height, w: meta.width });
  }
  const W = parts[0].w, H = parts[parts.length - 1].top + parts[parts.length - 1].h;
  await sharp({ create: { width: W, height: H, channels: 3, background: '#f6f4ee' }, limitInputPixels: false })
    .composite(parts.map(({ input, left, top }) => ({ input, left, top })))
    .withMetadata({ density: 300 })
    .png({ compressionLevel: 9 })
    .toFile('../poster/poster_A1_300dpi.png');
  console.log(`PNG ${W} x ${H} px`);
  // small preview for checking and sharing
  await png.close();
  const small = await browser.newPage({ viewport: { width: 2245, height: 3179 }, deviceScaleFactor: 0.75 });
  await small.goto(base + 'poster.html');
  await small.waitForFunction(() => window.__posterReady === true, null, { timeout: 60000 });
  await small.waitForTimeout(800);
  await small.locator('#sheet').screenshot({ path: '../poster/poster_preview.jpg', type: 'jpeg', quality: 86 });
  await small.close();
  console.log('wrote ../poster/poster_A1.pdf, poster_A1_300dpi.png, poster_preview.jpg');
}
await browser.close();
