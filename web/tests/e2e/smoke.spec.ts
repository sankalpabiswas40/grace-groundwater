import { expect, test, type Page } from '@playwright/test';

const SHOTS = 'tests/e2e/shots';
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}
async function ready(page: Page, path = '/') {
  await page.goto('.' + path); // relative, so the tests also work on the live sub-path
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 30000 });
}
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('page loads, headline comes from data, no sideways scroll', async ({ page }, info) => {
  const errors = watchErrors(page);
  await ready(page, '/?tier=lite');
  await expect(page.locator('h1')).toContainText('We weighed north India');
  await expect(page.locator('#hero-sub')).toContainText('km³');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-hero-lite.png` });
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  const c0 = await page.locator('#counter').textContent();
  await page.waitForTimeout(600);
  expect(await page.locator('#counter').textContent()).not.toBe(c0);
  expect(errors).toEqual([]);
});

test('full tier renders', async ({ page }, info) => {
  const errors = watchErrors(page);
  await ready(page, '/?tier=full');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-hero-full.png` });
  await expect(page.locator('body')).toHaveClass(/tier-full/);
  expect(errors).toEqual([]);
});

test('map plays and pauses, missing month shows No data, cell popup opens', async ({ page }, info) => {
  const errors = watchErrors(page);
  await ready(page, '/?tier=static#map');
  await page.locator('#map').scrollIntoViewIfNeeded();
  await expect(page.locator('#map-month')).toHaveText('Aug 2010', { timeout: 20000 });
  await page.locator('#map-stage').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-map.png` });
  await page.locator('#map-play').click();
  await page.waitForTimeout(1500);
  await expect(page.locator('#map-month')).not.toHaveText('Aug 2010');
  await page.locator('#map-play').click();
  const m1 = await page.locator('#map-month').textContent();
  await page.waitForTimeout(900);
  expect(await page.locator('#map-month').textContent()).toBe(m1);
  // December 2017 is inside the mission gap
  const idx = await page.evaluate(async () => (await (await fetch('data/grid.json')).json()).months.indexOf('2017-12'));
  await page.locator('#map-slider').evaluate((el, i) => { (el as HTMLInputElement).value = String(i); el.dispatchEvent(new Event('input')); }, idx);
  await expect(page.locator('#map-nodata')).toBeVisible();
  await expect(page.locator('#map-nodata-why')).toContainText('Mission gap');
  await page.locator('#map-slider').evaluate((el) => { (el as HTMLInputElement).value = '100'; el.dispatchEvent(new Event('input')); });
  await expect(page.locator('#map-nodata')).toBeHidden();
  await page.locator('#map-stage').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  const box = (await page.locator('#map-stage').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.55);
  await expect(page.locator('#map-popup')).toBeVisible();
  await expect(page.locator('#popup-trend')).toContainText('mm/yr');
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-map-popup.png` });
  await page.locator('#map [data-v="trend"]').click();
  await expect(page.locator('#map-month')).toHaveText('trend');
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-map-trend.png` });
  expect(errors).toEqual([]);
});

test('quiz gives feedback and a score', async ({ page }) => {
  const errors = watchErrors(page);
  await ready(page, '/?tier=static#quiz');
  const qs = page.locator('#quiz-body .q');
  await expect(qs).toHaveCount(4);
  await qs.nth(0).locator('.opt').nth(0).click();
  await expect(qs.nth(0).locator('.fb')).toContainText('Correct');
  await qs.nth(1).locator('.opt').nth(0).click();
  await expect(qs.nth(1).locator('.fb')).toContainText('Not quite');
  await expect(page.locator('#quiz-score')).toContainText('1 / 2');
  expect(errors).toEqual([]);
});

test('sections render: gravity slider, curve, methods equations', async ({ page }, info) => {
  const errors = watchErrors(page);
  await ready(page, '/?tier=static');
  await page.locator('#grav-slider').evaluate((el) => { (el as HTMLInputElement).value = '100'; el.dispatchEvent(new Event('input')); });
  await expect(page.locator('#grav-val')).toHaveText('+41.94');
  for (const id of ['gravity', 'satellites', 'method', 'curve', 'why', 'methods', 'about']) {
    await page.locator('#' + id).scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-${id}.png` });
  }
  await page.locator('#curve').scrollIntoViewIfNeeded();
  await expect(page.locator('#curve-chart svg path').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#ours-km3')).toContainText('km³/yr');
  await page.locator('#curve-split').click();
  await page.waitForTimeout(1200);
  await page.locator('#curve-chart').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-curve-split.png` });
  await page.locator('#methods').scrollIntoViewIfNeeded();
  await expect(page.locator('#methods-body .katex').first()).toBeVisible({ timeout: 15000 });
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('satellite fly-over responds to scrolling', async ({ page }, info) => {
  const errors = watchErrors(page);
  await ready(page, '/?tier=lite');
  await page.locator('#satellites').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  const top = await page.evaluate(() => document.getElementById('satellites')!.offsetTop);
  const h = await page.evaluate(() => document.getElementById('satellites')!.offsetHeight - innerHeight);
  await page.evaluate(([t, hh]) => window.scrollTo(0, t + hh * 0.5), [top, h]);
  await page.waitForTimeout(1200);
  const mid = parseFloat((await page.locator('#sat-val').textContent())!);
  expect(mid).toBeGreaterThan(2);
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-satellites-mid.png` });
  expect(errors).toEqual([]);
});

test('poster mode runs and any tap exits', async ({ page }, info) => {
  const errors = watchErrors(page);
  await ready(page, '/?tier=lite#poster');
  await expect(page.locator('body')).toHaveClass(/poster/);
  await expect(page.locator('#poster-caption')).not.toBeEmpty();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-poster.png` });
  await page.locator('#poster-overlay').click();
  await expect(page.locator('body')).not.toHaveClass(/poster/);
  expect(errors).toEqual([]);
});

test('static tier works with WebGL unavailable', async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type.startsWith('webgl')) return null;
      return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof orig;
  });
  await ready(page, '/');
  await expect(page.locator('body')).toHaveClass(/tier-static/);
  await expect(page.locator('#hero-static')).toBeVisible();
  await expect(page.locator('#tier-select')).toHaveValue('static');
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-hero-static.png` });
  expect(errors).toEqual([]);
});

test('3D columns: loads, plays, exaggeration label matches applied scale, missing month', async ({ page }, info) => {
  const errors = watchErrors(page);
  await ready(page, '/?tier=lite');
  await page.locator('#globe-stage').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expect(page.locator('#globe-month')).toHaveText('Aug 2010', { timeout: 30000 });
  await page.waitForTimeout(3500); // dive animation
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-globe.png` });
  await expect(page.locator('#globe-exag-out')).toContainText('5 km tall');
  const c = await page.evaluate(() => (window as unknown as { __columns: { kmPerCm: number; sampleHeight: number; baseCm: number } }).__columns);
  expect(c.kmPerCm).toBe(5);
  expect(c.sampleHeight).toBeCloseTo(((c.baseCm + 10) * 5) / 6371, 9);
  await page.locator('#globe-exag').evaluate((el) => { (el as HTMLInputElement).value = '8'; el.dispatchEvent(new Event('input')); });
  await expect(page.locator('#globe-exag-out')).toContainText('8 km tall');
  // full-screen explore mode opens and closes
  await page.locator('#globe-explore').click();
  await expect(page.locator('#globe-ui')).toHaveClass(/fullscreen/);
  expect(await page.evaluate(() => (window as unknown as { __exploring: boolean }).__exploring)).toBe(true);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-globe-fullscreen.png` });
  await page.locator('#globe-close').click();
  await expect(page.locator('#globe-ui')).not.toHaveClass(/fullscreen/);
  await page.locator('#globe-play').click();
  await page.waitForTimeout(1500);
  await expect(page.locator('#globe-month')).not.toHaveText('Aug 2010');
  await page.locator('#globe-play').click();
  const idx = await page.evaluate(async () => (await (await fetch('data/grid.json')).json()).months.indexOf('2017-12'));
  await page.locator('#globe-slider').evaluate((el, i) => { (el as HTMLInputElement).value = String(i); el.dispatchEvent(new Event('input')); }, idx);
  await expect(page.locator('#globe-nodata')).toBeVisible();
  await page.locator('#globe [data-gq="gws"]').click();
  await page.locator('#globe-slider').evaluate((el) => { (el as HTMLInputElement).value = '250'; el.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-globe-gws-late.png` });
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('underground: water-table change equals GWS / Sy from the real series', async ({ page }, info) => {
  const errors = watchErrors(page);
  await ready(page, '/?tier=lite');
  await page.locator('#underground').scrollIntoViewIfNeeded();
  await expect(page.locator('#ug-readout')).toContainText('m', { timeout: 20000 });
  const rs = await page.evaluate(async () => (await (await fetch('data/region_series.json')).json()));
  const i = rs.months.indexOf('2020-06');
  await page.locator('#ug-slider').evaluate((el, k) => { (el as HTMLInputElement).value = String(k); el.dispatchEvent(new Event('input')); }, i);
  let ug = await page.evaluate(() => (window as unknown as { __ug: { gwsCm: number; sy: number; dh: number; month: string } }).__ug);
  expect(ug.month).toBe('2020-06');
  expect(ug.sy).toBeCloseTo(0.12, 9);
  expect(ug.gwsCm).toBeCloseTo(rs.series.gws_jpl[i], 6);
  expect(ug.dh).toBeCloseTo(rs.series.gws_jpl[i] / 100 / 0.12, 9);
  await expect(page.locator('#ug-working')).toContainText('/ 0.12');
  await page.locator('#ug-sy').evaluate((el) => { (el as HTMLInputElement).value = '0.2'; el.dispatchEvent(new Event('input')); });
  ug = await page.evaluate(() => (window as unknown as { __ug: { gwsCm: number; sy: number; dh: number; month: string } }).__ug);
  expect(ug.dh).toBeCloseTo(rs.series.gws_jpl[i] / 100 / 0.2, 9);
  await page.locator('#ug-stage').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-underground.png` });
  const gap = rs.months.indexOf('2017-12');
  await page.locator('#ug-slider').evaluate((el, k) => { (el as HTMLInputElement).value = String(k); el.dispatchEvent(new Event('input')); }, gap);
  await expect(page.locator('#ug-readout')).toContainText('No data');
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
