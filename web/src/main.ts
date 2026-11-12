import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-400-italic.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource-variable/source-serif-4/wght.css';
import './style.css';
import { fmt, getJSON, monthLabel, url, type Meta } from './data';
import { initGravity, initMethods, initSatellites, initWhy, type SatHandle } from './sections';
import type { HeroHandle, Tier } from './hero';
import type { MapHandle } from './map';

const FACTS = [
  'GRACE stands for Gravity Recovery and Climate Experiment. The twin satellites flew from 2002 to 2017.',
  'GRACE-FO, the follow-on mission, launched on 22 May 2018.',
  'The two satellites fly about 220 km apart and track the distance between them.',
  'GRACE cannot take pictures. It senses mass: where there is more water, gravity is slightly stronger.',
  'One centimetre of water over a wide area changes gravity by about 0.42 microGal.',
  'It takes about a month of orbits to build one gravity map of the whole Earth.',
];

// ---------- theme
const root = document.documentElement;
// ---------- start position
// Always open at the top. The browser must not restore an old scroll position, and a
// refresh drops any #section left in the address by the menu. A fresh link that names a
// section (for example .../#map) still opens at that section.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
if (navEntry?.type === 'reload' && location.hash && location.hash !== '#poster') history.replaceState(null, '', location.pathname + location.search);
const startAtTop = location.hash.length <= 1 || location.hash === '#home';
if (startAtTop) window.scrollTo(0, 0);

const savedTheme = localStorage.getItem('theme');
if (savedTheme) root.dataset.theme = savedTheme;
document.getElementById('theme-toggle')!.addEventListener('click', () => {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  localStorage.setItem('theme', root.dataset.theme);
  window.dispatchEvent(new Event('themechange'));
});

// ---------- tier
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduced) document.body.classList.add('reduced');
function hasWebGL2(): boolean {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}
function detectTier(): Tier {
  if (!hasWebGL2() || reduced) return 'static';
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mem = nav.deviceMemory ?? 8, cores = navigator.hardwareConcurrency ?? 8;
  const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
  if (mem < 2 || cores < 2) return 'static';
  if (phone || mem <= 4 || cores <= 4) return 'lite';
  return 'full';
}
const forced = new URLSearchParams(location.search).get('tier') as Tier | null;
const userTier = (forced ?? localStorage.getItem('tier')) as Tier | null;
let tier: Tier = userTier && ['full', 'lite', 'static'].includes(userTier) ? userTier : detectTier();
if (tier !== 'static' && !hasWebGL2()) tier = 'static';
document.body.classList.add('tier-' + tier);
const tierSel = document.getElementById('tier-select') as HTMLSelectElement;
tierSel.value = tier;
tierSel.addEventListener('change', () => { localStorage.setItem('tier', tierSel.value); location.reload(); });

// ---------- loading with real byte progress
const bar = document.getElementById('loader-bar')!;
const bytesEl = document.getElementById('loader-bytes')!;
const factEl = document.getElementById('loader-fact')!;
let factI = Math.floor(Math.random() * FACTS.length);
factEl.textContent = FACTS[factI];
const factTimer = setInterval(() => { factI = (factI + 1) % FACTS.length; factEl.textContent = FACTS[factI]; }, 3200);

async function fetchAll(paths: string[]): Promise<Blob[]> {
  const loaded = new Array(paths.length).fill(0);
  const total = new Array(paths.length).fill(0);
  const upd = () => {
    const l = loaded.reduce((a, b) => a + b, 0), t = total.reduce((a, b) => a + b, 0);
    if (t > 0) bar.style.width = Math.min(100, (l / t) * 100) + '%';
    bytesEl.textContent = `${fmt(l / 1024, 0)} kB` + (t > 0 ? ` of ${fmt(t / 1024, 0)} kB` : '');
  };
  return Promise.all(paths.map(async (p, i) => {
    const r = await fetch(url(p));
    if (!r.ok) throw new Error(`Could not load ${p}`);
    total[i] = +(r.headers.get('content-length') ?? 0);
    if (!r.body) { const b = await r.blob(); loaded[i] = b.size; total[i] ||= b.size; upd(); return b; }
    const reader = r.body.getReader();
    const chunks: BlobPart[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); loaded[i] += value.byteLength; upd();
    }
    if (!total[i]) total[i] = loaded[i];
    upd();
    return new Blob(chunks, { type: r.headers.get('content-type') ?? '' });
  }));
}
const blobToImage = (b: Blob) => new Promise<HTMLImageElement>((res, rej) => {
  const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(b);
});

let hero: HeroHandle | null = null;
let mapH: MapHandle | null = null;
let satH: SatHandle | null = null;
let meta: Meta;

function showStaticHero() {
  (document.getElementById('hero-canvas') as HTMLCanvasElement).hidden = true;
  const el = document.getElementById('hero-static')!;
  el.hidden = false;
  document.querySelector('.hero-badge')!.textContent = 'Static image (pre-rendered). Satellites and orbit: schematic, not to scale.';
  const img = new Image();
  img.onload = () => { el.style.backgroundImage = `url(${img.src})`; };
  img.src = url('static/hero.jpg');
}

async function boot() {
  const big = tier === 'full' && Math.max(screen.width, screen.height) * (devicePixelRatio || 1) > 1700;
  const size = big ? 4096 : 2048;
  const paths = ['data/meta.json'];
  if (tier !== 'static') paths.push(`textures/day_${size}.jpg`, `textures/night_${size}.jpg`);
  let blobs: Blob[];
  try { blobs = await fetchAll(paths); }
  catch (e) { factEl.textContent = 'Could not load the data files. Please reload. ' + (e as Error).message; clearInterval(factTimer); return; }
  meta = JSON.parse(await blobs[0].text());
  initHeadline();
  if (tier === 'static') showStaticHero();
  else {
    try {
      const [{ initHero }, day, night] = await Promise.all([import('./hero'), blobToImage(blobs[1]), blobToImage(blobs[2])]);
      hero = initHero(document.getElementById('hero-canvas') as HTMLCanvasElement, tier, { day, night });
      new IntersectionObserver((es) => hero?.setActive(es[0].isIntersecting || document.body.classList.contains('poster')), { threshold: 0.01 }).observe(document.getElementById('home')!);
      if (!userTier) setTimeout(frameTest, 2500);
    } catch (e) { console.warn('3D hero unavailable, using static image', e); showStaticHero(); }
  }
  clearInterval(factTimer);
  document.getElementById('loader')!.classList.add('done');
  setTimeout(() => document.getElementById('loader')?.remove(), 700);

  initGravity(); initMethods(meta); void initWhy();
  lazy('#satellites', initSats);
  lazy('#method', async () => { document.getElementById('flow')!.classList.add('in'); (await import('./curve')).initBar(); });
  lazy('#globe', async () => {
    if (tier === 'static') { document.getElementById('globe-fallback')!.hidden = false; return; }
    try { await (await import('./columns')).initColumns(tier); }
    catch (e) { console.warn('3D columns unavailable', e); document.getElementById('globe-fallback')!.hidden = false; }
  });
  lazy('#inside', async () => {
    try { await (await import('./inside')).initInside(tier); }
    catch (e) { console.warn('inside view unavailable', e); document.getElementById('inside-fallback')!.hidden = false; }
  });
  lazy('#geoid', async () => {
    try { await (await import('./geoid')).initGeoid(tier); }
    catch (e) { console.warn('geoid view unavailable', e); document.getElementById('geoid-fallback')!.hidden = false; }
  });
  lazy('#underground', async () => { await (await import('./underground')).initUnderground(tier); });
  lazy('#map', async () => { mapH = await (await import('./map')).initMap(); });
  lazy('#curve', async () => { await (await import('./curve')).initCurve(meta); });
  lazy('.tex', renderTex, '400px');
  navSpy();
  window.addEventListener('hashchange', checkPoster);
  checkPoster();
  // deep links: layout shifts while lazy sections load, so re-anchor a few times
  const anchor = () => {
    if (userScrolled) return;
    if (startAtTop) return; // nothing moves the page once restoration is off
    if (location.hash !== '#poster') document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'auto' });
  };
  let userScrolled = false;
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((ev) => window.addEventListener(ev, () => { userScrolled = true; }, { once: true, passive: true }));
  [60, 500, 1200, 2200].forEach((ms) => setTimeout(anchor, ms));
  (window as unknown as { __ready: boolean }).__ready = true;
}

// 2-second frame-time test: step down a tier if the device cannot keep up
function frameTest() {
  if (!hero || document.hidden) return;
  const ms = hero.frameMs();
  (window as unknown as { __frameMs: number }).__frameMs = ms;
  const next: Tier | null = tier === 'full' && ms > 34 ? 'lite' : tier === 'lite' && ms > 70 ? 'static' : null;
  if (next) { sessionStorage.setItem('autoTier', next); localStorage.setItem('tier', next); location.reload(); }
}

function initHeadline() {
  const h = meta.headline;
  const km3 = Math.abs(h.gws_km3_per_yr);
  document.getElementById('hero-sub')!.innerHTML =
    `Our analysis of satellite gravity data finds north-west India's groundwater falling by about <b class="mono">${fmt(km3, 1)} km³</b> every year (${monthLabel(h.period[0])} to ${monthLabel(h.period[1])}).`;
  const rate = h.litres_per_second as number;
  const t0 = performance.now();
  const el = document.getElementById('counter')!;
  const tick = () => {
    el.textContent = Math.round((rate * (performance.now() - t0)) / 1000).toLocaleString('en-IN');
  };
  tick();
  setInterval(tick, reduced ? 1000 : 100);
  document.getElementById('counter-formula')!.innerHTML =
    `litres = |rate| × 10¹² L/km³ × seconds ÷ (365.25 × 86,400 s/yr), with our rate ${fmt(km3, 2)} km³/yr, which is about <span class="mono">${fmt(rate, 0)} litres every second</span>. See <a href="#curve">the trend</a> and <a href="#methods">methods</a>.`;
}

function lazy(sel: string, fn: () => void | Promise<void>, margin = '700px') {
  const els = document.querySelectorAll(sel);
  if (!els.length) return;
  let done = false;
  const io = new IntersectionObserver((es) => {
    if (done || !es.some((e) => e.isIntersecting)) return;
    done = true; io.disconnect();
    Promise.resolve(fn()).catch((e) => console.error(e));
  }, { rootMargin: margin });
  els.forEach((e) => io.observe(e));
}

async function renderTex() {
  const [{ default: katex }] = await Promise.all([import('katex'), import('katex/dist/katex.min.css')]);
  const go = () => document.querySelectorAll<HTMLElement>('.tex:not([data-done])').forEach((el) => {
    katex.render(el.dataset.tex!, el, { displayMode: true, throwOnError: false });
    el.dataset.done = '1';
  });
  go();
}

async function initSats() {
  if (tier !== 'static') {
    // 3D fly-over above, graph below; fall back to the flat diagram if 3D fails
    try {
      const fly = await (await import('./flyover')).initFlyover(tier);
      document.getElementById('fly-stage')!.hidden = false;
      document.getElementById('sat-badge')!.textContent =
        'Altitude (500 km) and separation (220 km) are to scale. Spacecraft size, the change in separation, the glow and the pull lines are schematic and hugely exaggerated. Model: NASA/JPL-Caltech.';
      satH = initSatellites({ graphOnly: true, onState: fly.update });
    } catch (e) {
      console.warn('3D fly-over unavailable, using the flat diagram', e);
      satH = initSatellites();
    }
  } else satH = initSatellites();
  window.addEventListener('themechange', () => satH?.setProgress(lastP));
  if (tier === 'static' || reduced) { lastP = 0.5; satH.setProgress(0.5); document.getElementById('sat-hint')!.textContent = 'Static view: the pair is shown directly above the mass.'; return; }
  const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.create({
    trigger: '#satellites', start: 'top top', end: 'bottom bottom', scrub: 0.4,
    onUpdate: (s) => { if (!document.body.classList.contains('poster')) { lastP = s.progress; satH!.setProgress(lastP); } },
  });
}
let lastP = 0;

function navSpy() {
  const links = [...document.querySelectorAll<HTMLAnchorElement>('.topbar nav a')];
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) links.forEach((l) => l.classList.toggle('active', l.getAttribute('href') === '#' + e.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('main > section[id]').forEach((s) => io.observe(s));
}

// ---------- poster mode
let posterTimer = 0, posterRaf = 0;
const SCENES: { id: string; caption: string; ms: number }[] = [
  { id: 'home', caption: 'Twin satellites weigh Earth’s water by measuring gravity.', ms: 14000 },
  { id: 'satellites', caption: 'Extra mass below pulls the leader first: the gap between the satellites changes.', ms: 14000 },
  { id: 'map', caption: 'North India’s water storage, month by month, from real GRACE data.', ms: 26000 },
];
function checkPoster() {
  if (location.hash === '#poster') startPoster(); else if (document.body.classList.contains('poster')) stopPoster(false);
}
async function startPoster() {
  if (document.body.classList.contains('poster')) return;
  document.body.classList.add('poster');
  const ov = document.getElementById('poster-overlay')!;
  ov.hidden = false;
  window.scrollTo(0, 0);
  if (!satH) await initSats();
  if (!mapH) mapH = await (await import('./map')).initMap();
  let i = -1;
  const next = () => {
    i = (i + 1) % SCENES.length;
    const sc = SCENES[i];
    document.querySelectorAll('main > section').forEach((s) => s.classList.toggle('poster-on', s.id === sc.id));
    document.getElementById('poster-caption')!.textContent = sc.caption;
    hero?.setActive(sc.id === 'home');
    cancelAnimationFrame(posterRaf);
    if (sc.id === 'satellites') {
      const t0 = performance.now();
      const run = (now: number) => { satH!.setProgress(Math.min(1, (now - t0) / (sc.ms - 2500))); posterRaf = requestAnimationFrame(run); };
      posterRaf = requestAnimationFrame(run);
    }
    if (sc.id === 'map') { window.dispatchEvent(new Event('resize')); mapH!.setMonth(0); mapH!.play(); } else mapH?.pause();
    posterTimer = window.setTimeout(next, sc.ms);
  };
  next();
  const exit = () => stopPoster(true);
  ov.addEventListener('click', exit, { once: true });
  window.addEventListener('keydown', exit, { once: true });
  (window as unknown as { __poster: boolean }).__poster = true;
}
function stopPoster(resetHash: boolean) {
  clearTimeout(posterTimer); cancelAnimationFrame(posterRaf);
  document.body.classList.remove('poster');
  document.querySelectorAll('.poster-on').forEach((s) => s.classList.remove('poster-on'));
  document.getElementById('poster-overlay')!.hidden = true;
  mapH?.pause(); hero?.setActive(true);
  (window as unknown as { __poster: boolean }).__poster = false;
  if (resetHash) history.replaceState(null, '', location.pathname + location.search + '#home');
  window.scrollTo(0, 0);
}

boot();
