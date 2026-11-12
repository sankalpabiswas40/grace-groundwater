// Chapter 6: under the ground. An illustrative cutaway block of alluvium whose water
// table moves with our real NW India groundwater series: delta_h = delta_GWS / Sy.
import { fmt, getJSON, monthLabel, type RegionSeries } from './data';
import { waterTableChange } from './physics';
import { REF_TABLE_DEPTH_M, type UgScene } from './underground3d';

export async function initUnderground(tier: 'full' | 'lite' | 'static'): Promise<void> {
  const rs = await getJSON<RegionSeries>('data/region_series.json');
  const gws = rs.series['gws_jpl'];
  const slider = document.getElementById('ug-slider') as HTMLInputElement;
  const sy = document.getElementById('ug-sy') as HTMLInputElement;
  const monthOut = document.getElementById('ug-month')!;
  const readout = document.getElementById('ug-readout')!;
  const working = document.getElementById('ug-working')!;
  const syOut = document.getElementById('ug-sy-out')!;
  const strip = document.getElementById('ug-strip')!;
  const n = rs.months.length;
  slider.max = String(n - 1);
  const lastValid = n - 1 - [...gws].reverse().findIndex((v) => v !== null);
  let scene3d: UgScene | null = null;

  // is storage rising this month? compare with the previous month that has data
  const risingAt = (i: number) => {
    const v = gws[i];
    if (v === null) return false;
    for (let k = i - 1; k >= 0; k--) { const p = gws[k]; if (p !== null) return v > p; }
    return false;
  };

  // timeline strip: the real regional series with a marker on the chosen month
  const fin = gws.filter((v): v is number => v !== null);
  const lo = Math.min(...fin), hi = Math.max(...fin);
  const SX = (i: number) => 4 + (292 * i) / (n - 1), SY = (v: number) => 44 - ((v - lo) / (hi - lo)) * 38;
  let path = '', pen = false;
  gws.forEach((v, i) => { if (v === null) { pen = false; return; } path += `${pen ? 'L' : 'M'}${SX(i).toFixed(1)} ${SY(v).toFixed(1)}`; pen = true; });
  strip.innerHTML = `<svg viewBox="0 0 300 62" role="img" aria-label="NW India groundwater storage anomaly over time with the selected month marked">
    <line x1="4" x2="296" y1="${SY(0).toFixed(1)}" y2="${SY(0).toFixed(1)}" stroke="var(--line)"/>
    <path d="${path}" fill="none" stroke="var(--jpl)" stroke-width="1.2"/>
    <line id="ug-strip-mark" x1="0" x2="0" y1="2" y2="48" stroke="var(--ink)" stroke-width="1.2"/>
    <text x="4" y="59">${rs.months[0].slice(0, 4)}</text><text x="296" y="59" text-anchor="end">${rs.months[n - 1].slice(0, 4)}</text>
    <text x="150" y="59" text-anchor="middle">groundwater storage, cm (our data)</text></svg>`;
  const mark = document.getElementById('ug-strip-mark')!;

  function update() {
    const i = +slider.value, s = +sy.value, v = gws[i];
    monthOut.textContent = monthLabel(rs.months[i]);
    slider.setAttribute('aria-valuetext', monthLabel(rs.months[i]));
    syOut.textContent = fmt(s, 2);
    mark.setAttribute('x1', SX(i).toFixed(1)); mark.setAttribute('x2', SX(i).toFixed(1));
    if (v === null) {
      readout.innerHTML = '<span class="mono big">No data</span> <span class="unit">for this month (no satellite solution or no land-model month)</span>';
      working.textContent = '';
      scene3d?.setLevel(null, false);
    } else {
      const dh = waterTableChange(v, s);
      readout.innerHTML = `<span class="mono big">${dh > 0 ? '+' : '−'}${fmt(Math.abs(dh), 1)} m</span> <span class="unit">estimated change in water-table height since the 2004–2009 average</span>`;
      working.textContent = `Δh = ΔGWS / Sy = ${fmt(v, 1)} cm / ${fmt(s, 2)} = ${fmt(v / 100, 3)} m / ${fmt(s, 2)} = ${fmt(dh, 2)} m`;
      scene3d?.setLevel(REF_TABLE_DEPTH_M - dh, risingAt(i));
    }
    (window as unknown as { __ug: unknown }).__ug = { month: rs.months[i], gwsCm: v, sy: s, dh: v === null ? null : waterTableChange(v, s), rising: risingAt(i) };
  }
  slider.addEventListener('input', update);
  sy.addEventListener('input', update);
  let timer = 0;
  const playBtn = document.getElementById('ug-play') as HTMLButtonElement;
  const stop = () => { clearInterval(timer); timer = 0; playBtn.innerHTML = '&#9654;'; playBtn.setAttribute('aria-label', 'Play'); };
  playBtn.addEventListener('click', () => {
    if (timer) { stop(); return; }
    playBtn.innerHTML = '&#10074;&#10074;'; playBtn.setAttribute('aria-label', 'Pause');
    timer = window.setInterval(() => { slider.value = String((+slider.value + 1) % n); update(); }, 160);
  });
  slider.addEventListener('pointerdown', stop);
  slider.value = String(lastValid);

  if (tier === 'static') {
    document.getElementById('ug-fallback')!.hidden = false;
  } else {
    try { scene3d = await (await import('./underground3d')).buildUnderground(tier); }
    catch (e) { console.warn('3D cutaway unavailable', e); document.getElementById('ug-fallback')!.hidden = false; }
  }
  update();
}
