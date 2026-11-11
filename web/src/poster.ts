// Print poster (A1). Every number and figure is drawn from the pipeline's data files.
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-400-italic.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource-variable/source-serif-4/wght.css';
import '@fontsource-variable/source-serif-4/wght-italic.css';
import * as d3 from 'd3';
import { evalFit, fmt, getJSON, loadFrames, monthLabel, url, type Meta, type RegionSeries, type TrendMap } from './data';
import { diverging } from './map';
import { bouguerMicroGal } from './physics';

const sign = (x: number, d = 2) => (x > 0 ? '+' : '−') + fmt(Math.abs(x), d);
const set = (id: string, html: string) => { document.getElementById(id)!.innerHTML = html; };
const CITIES: [string, number, number][] = [['Delhi', 28.61, 77.21], ['Chandigarh', 30.73, 76.78], ['Jaipur', 26.91, 75.79], ['Lucknow', 26.85, 80.95]];

async function main() {
  const [meta, rs, trend, frames, states, outlines] = await Promise.all([
    getJSON<Meta>('data/meta.json'), getJSON<RegionSeries>('data/region_series.json'), getJSON<TrendMap>('data/trend_map.json'),
    loadFrames(), getJSON<GeoJSON.FeatureCollection>('geo/states.geojson'), getJSON<{ nw: GeoJSON.Geometry }>('geo/outlines.json'),
  ]);
  (document.querySelector('.band') as HTMLElement).style.backgroundImage = `url(${url('static/poster-hero.jpg')})`;
  const h = meta.headline, per = `${monthLabel(h.period[0])} to ${monthLabel(h.period[1])}`;
  set('p-km3', fmt(Math.abs(h.gws_km3_per_yr), 1));
  set('p-period', per);
  document.querySelectorAll('.p-per').forEach((e) => (e.textContent = per));
  set('p-sub', `Our estimate: ${sign(h.gws_cm_per_yr)} ± ${fmt(h.gws_cm_per_yr_se, 2)} cm of water per year over ${fmt(meta.region.area_km2_grid_weighted, 0)} km², from ${h.n_months} months of satellite gravity data. About ${fmt(h.litres_per_second, 0)} litres every second.`);
  set('p-bouguer', fmt(bouguerMicroGal(0.01), 3));

  // results table
  const s = h.sensitivity, rc = meta.rodell_crosscheck, o = rc.ours_same_period.jpl, pub = rc.published, tw = meta.tws_trend.tws_jpl;
  set('p-table', `<tr><th>NW India trend, ${per}</th><th class="num">cm/yr</th><th class="num">km³/yr</th></tr>
    <tr class="hl"><td>Groundwater, JPL (headline)</td><td class="num">${sign(h.gws_cm_per_yr)} ± ${fmt(h.gws_cm_per_yr_se, 2)}</td><td class="num">${sign(h.gws_km3_per_yr, 1)}</td></tr>
    <tr><td>Groundwater, JPL with gain factors</td><td class="num">${sign(s.jpl_with_gain_factors_cm_per_yr)}</td><td class="num">${sign(s.jpl_with_gain_factors_km3_per_yr, 1)}</td></tr>
    <tr><td>Groundwater, CSR solution</td><td class="num">${sign(s.csr_cm_per_yr)}</td><td class="num">${sign(s.csr_km3_per_yr, 1)}</td></tr>
    <tr><td>Total water storage, JPL</td><td class="num">${sign(tw.cm_per_yr)} ± ${fmt(tw.se, 2)}</td><td class="num">${sign(tw.km3_per_yr, 1)}</td></tr>`);
  set('p-se-note', `km³/yr = Σ (trend in m/yr × cell area in m² × fraction of cell in region) ÷ 10⁹. ${meta.jpl.missing_months.length} of ${meta.jpl.missing_months.length + meta.jpl.n_solutions} months have no satellite solution.`);
  set('p-rodell', `Rodell et al. (2009) reported ${sign(pub.cm_per_yr, 1)} ± ${fmt(pub.cm_per_yr_unc, 1)} cm/yr (${sign(pub.km3_per_yr, 1)} ± ${fmt(pub.km3_per_yr_unc, 1)} km³/yr) for the same states, August 2002 to October 2008. Our fit over those months gives ${sign(o.cm_per_yr)} ± ${fmt(o.se, 2)} cm/yr (${sign(o.km3_per_yr, 1)} km³/yr): the same direction, but smaller. We use newer mascon data and did not tune anything to match.`);

  // ---- shared map drawing
  const { grid, ny, nx } = frames;
  const lat0 = grid.lat[0] - 0.25, lat1 = grid.lat[ny - 1] + 0.25, lon0 = grid.lon[0] - 0.25, lon1 = grid.lon[nx - 1] + 0.25;
  const box: GeoJSON.Feature = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[lon0, lat0], [lon0, lat1], [lon1, lat1], [lon1, lat0], [lon0, lat0]]] } };
  function drawMap(el: HTMLElement, values: ArrayLike<number | null>, range: number, opts: { labels?: boolean; title?: string } = {}) {
    const W = el.clientWidth, H = el.clientHeight;
    const proj = d3.geoMercator().fitSize([W, H], box);
    const path = d3.geoPath(proj);
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
    const b = path.bounds(box);
    svg.append('rect').attr('x', b[0][0]).attr('y', b[0][1]).attr('width', b[1][0] - b[0][0]).attr('height', b[1][1] - b[0][1]).attr('fill', '#e9e6dc');
    const g = svg.append('g').attr('shape-rendering', 'crispEdges');
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const v = values[j * nx + i];
      if (v === null || Number.isNaN(v)) continue;
      const p0 = proj([lon0 + i * 0.5, lat0 + (j + 1) * 0.5])!, p1 = proj([lon0 + (i + 1) * 0.5, lat0 + j * 0.5])!;
      g.append('rect').attr('x', p0[0] - 0.15).attr('y', p0[1] - 0.15).attr('width', p1[0] - p0[0] + 0.3).attr('height', p1[1] - p0[1] + 0.3)
        .attr('fill', diverging(Math.max(0, Math.min(1, 0.5 + (v as number) / range / 2))));
    }
    svg.append('g').selectAll('path').data(states.features).join('path').attr('d', path as never).attr('fill', 'none').attr('stroke', '#2f3947').attr('stroke-width', opts.labels ? 0.8 : 0.5).attr('opacity', 0.75);
    svg.append('path').attr('d', path(outlines.nw as never)).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', opts.labels ? 5 : 2.6);
    svg.append('path').attr('d', path(outlines.nw as never)).attr('fill', 'none').attr('stroke', '#111').attr('stroke-width', opts.labels ? 2.6 : 1.3);
    if (opts.labels) {
      const fs = W / 36;
      const cg = svg.append('g').selectAll('g').data(CITIES).join('g').attr('transform', (d) => { const p = proj([d[2], d[1]])!; return `translate(${p[0]},${p[1]})`; });
      cg.append('circle').attr('r', fs * 0.28).attr('fill', '#111').attr('stroke', '#fff').attr('stroke-width', fs * 0.1);
      cg.append('text').attr('x', fs * 0.5).attr('y', (d) => (d[0] === 'Jaipur' ? fs * 1.05 : -fs * 0.4)).text((d) => d[0])
        .style('font', `600 ${fs}px var(--sans)`).attr('paint-order', 'stroke').attr('stroke', '#fff').attr('stroke-width', fs * 0.28);
      // colour bar inside the map, bottom-left over the sea
      const bw = W * 0.34, bh = fs * 0.9, bx = b[0][0] + fs, by = b[1][1] - fs * 3.2;
      const grad = svg.append('defs').append('linearGradient').attr('id', 'pg');
      d3.range(0, 1.001, 0.1).forEach((t) => grad.append('stop').attr('offset', `${t * 100}%`).attr('stop-color', diverging(t)));
      svg.append('rect').attr('x', bx - fs * 0.6).attr('y', by - fs * 1.9).attr('width', bw + fs * 1.2).attr('height', fs * 4.6).attr('fill', '#f6f4ee').attr('opacity', 0.94);
      svg.append('rect').attr('x', bx).attr('y', by).attr('width', bw).attr('height', bh).attr('fill', 'url(#pg)').attr('stroke', '#111').attr('stroke-width', 0.5);
      [-range, -range / 2, 0, range / 2, range].forEach((v, k) => svg.append('text').attr('x', bx + (bw * k) / 4).attr('y', by + bh + fs * 1.05).attr('text-anchor', 'middle').style('font-size', `${fs * 0.82}px`).text((v > 0 ? '+' : '') + v));
      svg.append('text').attr('x', bx).attr('y', by - fs * 0.55).style('font', `600 ${fs * 0.85}px var(--sans)`).text('mm of water per year (brown = losing)');
    }
    if (opts.title) { const ts = W / 21; svg.append('text').attr('x', b[0][0] + ts * 0.4).attr('y', b[0][1] + ts * 1.2).style('font', `600 ${ts}px var(--sans)`).attr('paint-order', 'stroke').attr('stroke', '#f6f4ee').attr('stroke-width', ts * 0.3).text(opts.title); }
  }
  drawMap(document.getElementById('p-map')!, trend['gws_jpl'] as (number | null)[], 60, { labels: true });
  const fa = frames.frame(0, grid.months.indexOf('2010-05')), fb = frames.frame(0, grid.months.indexOf('2010-08'));
  drawMap(document.getElementById('p-mini-a')!, fa, 40, { title: 'May 2010' });
  drawMap(document.getElementById('p-mini-b')!, fb, 40, { title: 'August 2010' });
  { // small colour bar for the mini maps
    const el = document.getElementById('p-mini-bar')!, W = el.clientWidth, H = el.clientHeight;
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'plot');
    const grad = svg.append('defs').append('linearGradient').attr('id', 'pg2');
    d3.range(0, 1.001, 0.1).forEach((t) => grad.append('stop').attr('offset', `${t * 100}%`).attr('stop-color', diverging(t)));
    const bw = W * 0.5, bx = W * 0.25;
    svg.append('rect').attr('x', bx).attr('y', 1).attr('width', bw).attr('height', H * 0.38).attr('fill', 'url(#pg2)').attr('stroke', '#111').attr('stroke-width', 0.4);
    [-40, -20, 0, 20, 40].forEach((v, k) => svg.append('text').attr('x', bx + (bw * k) / 4).attr('y', H - 1).attr('text-anchor', 'middle').style('font', `${H * 0.42}px var(--mono)`).text((v > 0 ? '+' : '') + v + (k === 4 ? ' cm' : '')));
  }

  // ---- time series
  {
    const el = document.getElementById('p-curve')!, W = el.clientWidth, H = el.clientHeight, m = { l: 84, r: 14, t: 14, b: 44 };
    const t = rs.t_decimal_year, jpl = rs.series['gws_jpl'], csr = rs.series['gws_csr'], fit = rs.fits['gws_jpl'].full;
    const x = d3.scaleLinear([t[0], t[t.length - 1] + 0.1], [m.l, W - m.r]);
    const vals = [...jpl, ...csr].filter((v): v is number => v !== null);
    const y = d3.scaleLinear(d3.extent(vals) as [number, number], [H - m.b, m.t]).nice();
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
    const fs = 22;
    svg.append('rect').attr('x', x(2017.5)).attr('width', x(2018.42) - x(2017.5)).attr('y', m.t).attr('height', H - m.b - m.t).attr('fill', 'var(--gap)');
    y.ticks(6).forEach((v) => {
      svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', v === 0 ? '#14202e' : '#c9c5b8').attr('stroke-width', v === 0 ? 0.9 : 0.5);
      svg.append('text').attr('x', m.l - 8).attr('y', y(v) + fs * 0.35).attr('text-anchor', 'end').style('font-size', `${fs}px`).text(v);
    });
    d3.range(2004, 2027, 2).forEach((yr) => {
      svg.append('line').attr('x1', x(yr)).attr('x2', x(yr)).attr('y1', H - m.b).attr('y2', H - m.b + 6).attr('stroke', '#14202e');
      svg.append('text').attr('x', x(yr)).attr('y', H - m.b + 6 + fs).attr('text-anchor', 'middle').style('font-size', `${fs}px`).text(yr);
    });
    svg.append('text').attr('transform', `translate(${fs},${(H - m.b + m.t) / 2}) rotate(-90)`).attr('text-anchor', 'middle').style('font', `600 ${fs}px var(--sans)`).text('cm of water vs 2004–2009');
    const line = (ys: (number | null)[]) => d3.line<number | null>().defined((d) => d !== null).x((_, i) => x(t[i])).y((d) => y(d as number))(ys)!;
    svg.append('path').attr('d', line(csr)).attr('fill', 'none').attr('stroke', 'var(--csr)').attr('stroke-width', 1.6);
    svg.append('path').attr('d', line(jpl)).attr('fill', 'none').attr('stroke', 'var(--jpl)').attr('stroke-width', 2.2);
    svg.append('line').attr('x1', x(t[0])).attr('x2', x(t[t.length - 1])).attr('y1', y(evalFit(fit, t[0], { trend: true }))).attr('y2', y(evalFit(fit, t[t.length - 1], { trend: true })))
      .attr('stroke', '#14202e').attr('stroke-width', 1.8).attr('stroke-dasharray', '9 6');
    // direct labels
    const lab = (tx: number, ty: number, text: string, col: string, w = 600) => svg.append('text').attr('x', tx).attr('y', ty).style('font', `${w} ${fs * 1.05}px var(--sans)`).style('fill', col).attr('paint-order', 'stroke').attr('stroke', '#f6f4ee').attr('stroke-width', 5).text(text);
    svg.append('line').attr('x1', x(2019.2)).attr('x2', x(2019.9)).attr('y1', y(13)).attr('y2', y(13)).attr('stroke', 'var(--jpl)').attr('stroke-width', 3);
    lab(x(2020.05), y(13) + fs * 0.35, 'JPL mascons', 'var(--jpl)');
    svg.append('line').attr('x1', x(2022.6)).attr('x2', x(2023.3)).attr('y1', y(13)).attr('y2', y(13)).attr('stroke', 'var(--csr)').attr('stroke-width', 3);
    lab(x(2023.45), y(13) + fs * 0.35, 'CSR mascons', 'var(--csr)');
    lab(x(2011.2), y(evalFit(fit, 2011.2, { trend: true })) - fs * 2.3, `trend ${sign(fit.slope_cm_per_yr)} cm per year`, '#14202e');
    lab(x(2017.96), m.t + fs * 1.3, 'no data', '#55606e', 400).attr('text-anchor', 'middle');
  }
  await document.fonts.ready;
  (window as unknown as { __posterReady: boolean }).__posterReady = true;
}
main().catch((e) => { document.body.insertAdjacentHTML('afterbegin', `<p style="color:red;font-size:40px">Poster failed: ${e}</p>`); throw e; });
