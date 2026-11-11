// Smaller sections: gravity slider, satellite fly-over, quiz, methods, why.
import { bouguerMicroGal, orbitalSpeed, rangeChangeRel } from './physics';
import { fmt, getJSON, monthLabel, type Meta } from './data';

// ---------------- gravity slider
export function initGravity(): void {
  const slider = document.getElementById('grav-slider') as HTMLInputElement;
  const water = document.getElementById('grav-water')!;
  const table = document.getElementById('grav-table')!;
  const tl = document.getElementById('grav-tlabel')!;
  const mass = document.getElementById('grav-mass')!;
  const spring = document.getElementById('grav-spring')!;
  const upd = () => {
    const cm = +slider.value;
    const ug = bouguerMicroGal(cm / 100);
    document.getElementById('grav-h')!.textContent = `${cm > 0 ? '+' : ''}${cm} cm of water`;
    document.getElementById('grav-val')!.textContent = `${ug > 0 ? '+' : ug < 0 ? '−' : ''}${fmt(Math.abs(ug), 2)}`;
    slider.setAttribute('aria-valuetext', `${cm} centimetres of water, ${ug.toFixed(2)} microGal`);
    const y = 209 - (cm / 200) * 55; // schematic
    water.setAttribute('y', String(y)); water.setAttribute('height', String(274 - y));
    table.setAttribute('y1', String(y)); table.setAttribute('y2', String(y));
    tl.setAttribute('y', String(y - 6));
    const dy = (cm / 200) * 7;
    mass.setAttribute('y', String(-15 + dy));
    const s = (5 + dy / 4).toFixed(2);
    spring.setAttribute('d', `M0-36 l5 ${+s * 0.6} -10 ${s} 10 ${s} -10 ${s} 5 ${+s * 0.6}`);
  };
  slider.addEventListener('input', upd);
  upd();
}

// ---------------- satellites
const H_ORBIT = 500e3; // m, NASA: "altitude of more than 300 miles (500 km)"
const L_SEP = 220e3; // m, NASA: "about 137 miles (220 km) apart"
const X_FAR = 1800e3;

export interface SatHandle { setProgress(p: number): void; }

export function initSatellites(): SatHandle {
  const canvas = document.getElementById('sat-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const slider = document.getElementById('sat-mass') as HTMLInputElement;
  const v = orbitalSpeed(H_ORBIT);
  let p = 0;
  const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  document.getElementById('sat-params')!.textContent =
    `h = 500 km, L = 220 km, v = √(GM⊕/(R+h)) = ${fmt(v / 1000, 2)} km/s, G = 6.674×10⁻¹¹ m³ kg⁻¹ s⁻²`;

  function draw() {
    const W = canvas.width, Hh = canvas.height;
    const fs = (canvas.clientWidth || 800) < 520 ? 1.55 : 1; // larger labels on phones
    const font = (px: number, fam = 'system-ui', wt = '') => `${wt} ${Math.round(px * fs)}px ${fam}`.trim();
    const M = +slider.value * 1e12; // Gt -> kg
    document.getElementById('sat-mass-out')!.textContent = `${slider.value} Gt (= ${slider.value} km³ of water)`;
    const ink = css('--ink') || '#111', muted = css('--muted') || '#666', accent = css('--accent') || '#06c', line = css('--line') || '#ccc';
    ctx.clearRect(0, 0, W, Hh);
    // --- upper scene
    const sceneH = 280, groundY = 215;
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#06101f'); sky.addColorStop(1, '#17335a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, groundY);
    ctx.fillStyle = '#5a4630'; ctx.fillRect(0, groundY, W, sceneH - groundY);
    ctx.fillStyle = '#2f6b3c'; ctx.fillRect(0, groundY, W, 5);
    // mass
    const mx = W / 2, my = groundY + 36, mr = 10 + Math.sqrt(+slider.value) * 3.2;
    const glow = ctx.createRadialGradient(mx, my, 2, mx, my, mr * 2.2);
    glow.addColorStop(0, 'rgba(92,194,230,0.95)'); glow.addColorStop(1, 'rgba(92,194,230,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(mx, my, mr * 2.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#5cc2e6'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = font(20, 'system-ui', '600'); ctx.textAlign = 'center';
    ctx.fillText('extra mass (water)', mx, sceneH - 8);
    // satellites
    const x = -X_FAR + 2 * X_FAR * p; // m
    const d = rangeChangeRel(x, M, H_ORBIT, L_SEP, v, X_FAR);
    const dMax = rangeChangeRel(0, 50e12, H_ORBIT, L_SEP, v, X_FAR);
    const px = (xm: number) => W / 2 + (xm / X_FAR) * (W / 2 - 40);
    const sepPx = (L_SEP / X_FAR) * (W / 2 - 40) + (d / dMax) * 70; // exaggerated on screen
    const cx = px(x), sy = 70;
    const lead = cx + sepPx / 2, trail = cx - sepPx / 2;
    // gravity pull lines (schematic)
    ctx.strokeStyle = 'rgba(127,208,238,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
    [lead, trail].forEach((sx) => { ctx.beginPath(); ctx.moveTo(sx, sy + 14); ctx.lineTo(mx, my - mr); ctx.stroke(); });
    ctx.setLineDash([]);
    // ranging link
    ctx.strokeStyle = '#7fd0ee'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(trail + 20, sy); ctx.lineTo(lead - 20, sy); ctx.stroke();
    const sat = (sx: number, label: string, align: CanvasTextAlign) => {
      ctx.fillStyle = '#10214a'; ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx - 22, sy + 10); ctx.lineTo(sx + 22, sy + 10); ctx.lineTo(sx + 12, sy - 10); ctx.lineTo(sx - 12, sy - 10); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d6e2f0'; ctx.font = font(18); ctx.textAlign = align;
      ctx.fillText(label, sx + (align === 'right' ? -30 : 30), sy + 6);
    };
    sat(trail, 'follower', 'right'); sat(lead, 'leader', 'left');
    ctx.fillStyle = '#b9c8db'; ctx.font = font(17, 'ui-monospace, monospace'); ctx.textAlign = 'right';
    ctx.fillText('direction of flight →', W - 14, 16 + 12 * fs);
    // --- graph
    const gx0 = 70 + 26 * fs, gx1 = W - 20, gy0 = sceneH + 26, gy1 = Hh - 30 - 26 * fs;
    ctx.fillStyle = css('--card') || '#fff'; ctx.fillRect(0, sceneH, W, Hh - sceneH);
    const yMaxUm = Math.max(1, Math.ceil((rangeChangeRel(0, M, H_ORBIT, L_SEP, v, X_FAR) * 1e6) / 5) * 5);
    const gx = (xm: number) => gx0 + ((xm + X_FAR) / (2 * X_FAR)) * (gx1 - gx0);
    const gy = (um: number) => gy1 - (um / yMaxUm) * (gy1 - gy0);
    ctx.strokeStyle = line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(gx0, gy0); ctx.lineTo(gx0, gy1); ctx.lineTo(gx1, gy1); ctx.stroke();
    ctx.fillStyle = muted; ctx.font = font(17, 'ui-monospace, monospace'); ctx.textAlign = 'right';
    [0, yMaxUm / 2, yMaxUm].forEach((t) => ctx.fillText(fmt(t, t % 1 ? 1 : 0), gx0 - 8, gy(t) + 6));
    ctx.textAlign = 'center';
    [-1500, 0, 1500].forEach((km) => ctx.fillText(`${km} km`, gx(km * 1000), gy1 + 8 + 14 * fs));
    ctx.fillText(fs > 1 ? 'position relative to the mass' : 'position of the pair relative to the mass', (gx0 + gx1) / 2, Hh - 6);
    ctx.save(); ctx.translate(6 + 14 * fs, (gy0 + gy1) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Δ separation, µm', 0, 0); ctx.restore();
    // faint full curve + drawn part
    const curve = (xEnd: number, style: string, w: number) => {
      ctx.strokeStyle = style; ctx.lineWidth = w; ctx.beginPath();
      for (let xm = -X_FAR; xm <= xEnd; xm += X_FAR / 150) {
        const yy = gy(rangeChangeRel(xm, M, H_ORBIT, L_SEP, v, X_FAR) * 1e6);
        if (xm === -X_FAR) ctx.moveTo(gx(xm), yy); else ctx.lineTo(gx(xm), yy);
      }
      ctx.stroke();
    };
    curve(X_FAR, line, 2);
    curve(x, accent, 4);
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(gx(x), gy(d * 1e6), 7, 0, 7); ctx.fill();
    ctx.fillStyle = ink;
    document.getElementById('sat-val')!.textContent = fmt(d * 1e6, 1);
  }
  slider.addEventListener('input', draw);
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  draw();
  return { setProgress(v2: number) { p = Math.max(0, Math.min(1, v2)); draw(); } };
}

// ---------------- quiz
const QUIZ: { q: string; opts: string[]; a: number; why: string }[] = [
  {
    q: 'Why do the two satellites move apart as they approach a region with extra mass?',
    opts: ['The leader is pulled forward by the extra gravity first', 'The follower runs out of fuel', 'Air drag slows the follower', 'Mission control steers them apart'],
    a: 0, why: 'The leading satellite feels the extra pull first and speeds up, so the gap grows until the follower is pulled too.',
  },
  {
    q: 'Why do we need the GLDAS land model to get groundwater?',
    opts: ['GRACE only works over oceans', 'GRACE weighs all water together, so soil moisture, snow and canopy water must be subtracted', 'GLDAS measures gravity more precisely', 'To convert centimetres into kilometres'],
    a: 1, why: 'GRACE measures total water storage. Groundwater is what is left after subtracting modelled soil moisture, snow and canopy water, so it inherits the model’s errors.',
  },
  {
    q: 'What is the 2017–2018 gap in the record?',
    opts: ['A drought with no water to measure', 'Months removed because they looked wrong', 'The time between the end of GRACE and the start of GRACE-FO, when no satellite pair was measuring', 'A pause for the monsoon'],
    a: 2, why: 'GRACE ended in 2017 and GRACE-FO launched on 22 May 2018. We leave those months empty instead of filling them in.',
  },
  {
    q: 'Why does the map look blurry and blocky?',
    opts: ['The website compressed the image', 'Clouds block the view', 'The satellites only pass over at night', 'Gravity measured from about 500 km up can only resolve features roughly 300 km across'],
    a: 3, why: 'From orbit, gravity signals smaller than about 300 km blend together. The 0.5° grid is finer than the real measurement.',
  },
];

export function initQuiz(): void {
  const body = document.getElementById('quiz-body')!;
  const score = document.getElementById('quiz-score')!;
  let right = 0, done = 0;
  QUIZ.forEach((item, qi) => {
    const div = document.createElement('div');
    div.className = 'q';
    div.innerHTML = `<fieldset><legend>${qi + 1}. ${item.q}</legend></fieldset><p class="fb" aria-live="polite"></p>`;
    const fs = div.querySelector('fieldset')!;
    const fb = div.querySelector('.fb')!;
    item.opts.forEach((o, oi) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'opt'; b.textContent = o;
      b.addEventListener('click', () => {
        fs.querySelectorAll('button').forEach((x, xi) => { (x as HTMLButtonElement).disabled = true; if (xi === item.a) x.classList.add('right'); });
        const ok = oi === item.a;
        if (!ok) b.classList.add('wrong'); else right++;
        done++;
        fb.textContent = (ok ? 'Correct. ' : 'Not quite. ') + item.why;
        score.textContent = `Score: ${right} / ${done}` + (done === QUIZ.length ? (right === QUIZ.length ? ' — all correct.' : ' — finished.') : '');
      });
      fs.appendChild(b);
    });
    body.appendChild(div);
  });
}

// ---------------- methods
export function initMethods(meta: Meta): void {
  const p = meta.provenance, h = meta.headline, r = meta.region;
  const gap = meta.jpl.mission_gap_months;
  const html = `
  <h3>Data products</h3>
  <ul>
    <li><b>Total water storage (main):</b> JPL GRACE and GRACE-FO Mascon, CRI filtered, ${p.jpl_mascon.version} (<span class="mono">${p.jpl_mascon.short_name}</span>), NASA PO.DAAC. DOI <a href="https://doi.org/${p.jpl_mascon.doi}" rel="noopener">${p.jpl_mascon.doi}</a>. File <span class="mono small">${p.jpl_mascon.file}</span>, downloaded ${p.jpl_mascon.download_date}. Watkins et al. (2015) doi:10.1002/2014JB011547; Wiese et al. (2016) doi:10.1002/2016WR019344.</li>
    <li><b>Independent comparison:</b> ${p.csr_mascon.product}, University of Texas CSR. DOI <a href="https://doi.org/${p.csr_mascon.doi}" rel="noopener">${p.csr_mascon.doi}</a>; Save et al. (2016) doi:10.1002/2016JB013007. Downloaded ${p.csr_mascon.download_date}.</li>
    <li><b>Land-surface model:</b> GLDAS Noah L4 monthly 0.25&deg; V${p.gldas_noah.version} (<span class="mono">${p.gldas_noah.short_name}</span>), NASA GES DISC. DOI <a href="https://doi.org/${p.gldas_noah.doi}" rel="noopener">${p.gldas_noah.doi}</a>. Variables: <span class="mono small">${p.gldas_noah.variables.join(', ')}</span> (kg m<sup>&minus;2</sup> = mm). ${p.gldas_noah.n_months} months, through ${monthLabel(meta.gldas.last_month)}.</li>
    <li><b>Boundaries:</b> ${p.state_boundaries.provider}, <span class="mono">${p.state_boundaries.file}</span>, ${p.state_boundaries.licence}. ${p.state_boundaries.note}</li>
  </ul>
  <h3>Processing steps</h3>
  <ol>
    <li>Cut all products to 20&ndash;38&deg;N, 66&ndash;92&deg;E. Build a calendar-month axis (${meta.jpl.n_solutions} JPL solutions in ${meta.n_calendar_months ?? ''} months). Missing months stay empty: ${meta.jpl.missing_months.length} months have no JPL solution, including the ${gap.length}-month mission gap (${monthLabel(gap[0])} to ${monthLabel(gap[gap.length - 1])}). Nothing is interpolated.</li>
    <li>JPL: land mask applied. Gain factors (supplied in the file) are applied for the monthly maps; trends are computed without them and the with-gain result is reported as a sensitivity test.</li>
    <li>CSR and GLDAS (0.25&deg;) are averaged to the 0.5&deg; JPL grid with spherical cell-area weights.</li>
    <li>GLDAS storage = four soil layers + snow water equivalent + canopy water, converted to cm, as anomalies relative to January 2004 &ndash; December 2009 (the GRACE baseline, ${meta.baseline.split(' (')[0]}).</li>
    <li>Groundwater = total water storage &minus; GLDAS storage. Surface water and reservoirs are not removed.</li>
    <li>Regional mean over ${r.states.join(', ')}: area-weighted, each cell weighted by its area and the fraction of the cell inside the region.</li>
    <li>Trend: least squares with annual and semi-annual terms on available months.</li>
  </ol>
  <h3>Equations</h3>
  <p>Cell area on the sphere (R = 6371 km):</p>
  <div class="tex" data-tex="A = R^{2}\\,\\Delta\\lambda\\,(\\sin\\varphi_{2}-\\sin\\varphi_{1})"></div>
  <p>Volume rate for the region (b in m/yr, A in m&sup2;, f = fraction of the cell inside the region):</p>
  <div class="tex" data-tex="\\dot V\\;[\\mathrm{km^{3}/yr}] = \\frac{1}{10^{9}}\\sum_{\\text{cells}} b_{i}\\,A_{i}\\,f_{i}"></div>
  <p class="mono small">Check: ${fmt(h.gws_cm_per_yr, 3)} cm/yr &times; ${fmt(r.area_km2_grid_weighted, 0)} km&sup2; = ${fmt(h.gws_cm_per_yr / 100, 5)} m/yr &times; ${(r.area_km2_grid_weighted * 1e6).toExponential(4)} m&sup2; / 10&#8313; = ${fmt(h.gws_km3_per_yr, 2)} km&sup3;/yr</p>
  <p>Region area from our grid: ${fmt(r.area_km2_grid_weighted, 0)} km&sup2; (polygons: ${fmt(r.area_km2_polygons, 0)} km&sup2;). The region touches ${r.n_cells_touched} grid cells but only ${r.n_jpl_mascons_touched} JPL mascons, so it is only about a dozen independent measurements.</p>
  <h3>Limitations</h3>
  <ul>${meta.limits.map((l: string) => `<li>${l}</li>`).join('')}
    <li>The formal trend error assumes independent monthly residuals; they are autocorrelated, so it is a lower bound.</li>
    <li>JPL describes its gain factors as suitable for hydrology signals but derived mainly from the seasonal cycle, so we do not rely on them for the trend.</li>
  </ul>
  <h3>Reproduce this</h3>
  <p>From the project folder, in PowerShell, with Python 3.11+ and a free NASA Earthdata login:</p>
  <pre>python -m venv $HOME\\grace-groundwater-venv
& $HOME\\grace-groundwater-venv\\Scripts\\python.exe -m pip install -r pipeline\\requirements.txt
& $HOME\\grace-groundwater-venv\\Scripts\\python.exe pipeline\\download.py login
& $HOME\\grace-groundwater-venv\\Scripts\\python.exe pipeline\\download.py all
& $HOME\\grace-groundwater-venv\\Scripts\\python.exe pipeline\\process.py
& $HOME\\grace-groundwater-venv\\Scripts\\python.exe pipeline\\export.py
& $HOME\\grace-groundwater-venv\\Scripts\\python.exe -m pytest pipeline\\tests</pre>
  <p class="small muted">Data files generated ${meta.generated}. Code repository: <span id="repo-link">link added at deployment</span>.</p>`;
  document.getElementById('methods-body')!.innerHTML = html;
}

// ---------------- why (figures only from the cited source file)
export async function initWhy(): Promise<void> {
  const text = document.getElementById('why-text')!;
  const fig = document.getElementById('why-figure')!;
  let why: { paragraphs: string[]; bars?: { label: string; value: number }[]; bar_title?: string; bar_unit?: string; source_html: string } | null = null;
  try { why = await getJSON('data/why.json'); } catch { why = null; }
  if (!why) {
    text.innerHTML = '<p>This section is waiting for figures from the Central Ground Water Board assessment. No numbers are shown until they have been checked against the source.</p>';
    fig.hidden = true;
    return;
  }
  text.innerHTML = why.paragraphs.map((p) => `<p>${p}</p>`).join('') + `<p class="small muted">${why.source_html}</p>`;
  if (why.bars?.length) {
    const max = Math.max(100, ...why.bars.map((b) => b.value));
    fig.innerHTML = `<h3>${why.bar_title ?? ''}</h3>` + why.bars.map((b) =>
      `<div class="row" style="margin:.5rem 0"><span style="flex:0 0 6.5rem" class="small">${b.label}</span>
       <span style="flex:1;position:relative;height:22px;background:var(--bg-alt);border-radius:4px">
         <span style="position:absolute;left:0;top:0;bottom:0;width:${(b.value / max) * 100}%;background:${b.value > 100 ? 'var(--csr)' : 'var(--jpl)'};border-radius:4px"></span>
         <span style="position:absolute;left:${(100 / max) * 100}%;top:-3px;bottom:-3px;border-left:2px dashed var(--ink)"></span></span>
       <span class="mono small" style="flex:0 0 3.6rem;text-align:right">${fmt(b.value, 0)}${why!.bar_unit ?? ''}</span></div>`).join('') +
      '<p class="small muted">Dashed line: 100% = extraction equals the annual extractable recharge.</p>';
  } else fig.hidden = true;
}
