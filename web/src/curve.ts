// Regional time series, cycle/trend separation, result cards, component bar chart.
import * as d3 from 'd3';
import 'd3-transition';
import { evalFit, fmt, getJSON, monthLabel, type Meta, type RegionSeries } from './data';

const sign = (x: number, d = 2) => (x > 0 ? '+' : '−') + fmt(Math.abs(x), d);

export async function initCurve(meta: Meta): Promise<void> {
  const rs = await getJSON<RegionSeries>('data/region_series.json');
  const el = document.getElementById('curve-chart')!;
  const t = rs.t_decimal_year;
  let q: 'gws' | 'tws' = 'gws';
  let split = false;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function render(animate = false) {
    const W = el.clientWidth || 600;
    const small = W < 560;
    const H = split ? (small ? 460 : 480) : small ? 300 : 380;
    const m = { l: 44, r: 12, t: 14, b: 26 };
    const jpl = rs.series[`${q}_jpl`], csr = rs.series[`${q}_csr`];
    const fit = rs.fits[`${q}_jpl`].full;
    const x = d3.scaleLinear([t[0], t[t.length - 1]], [m.l, W - m.r]);
    d3.select(el).selectAll('*').remove();
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
    const line = (ys: (number | null)[], y: d3.ScaleLinear<number, number>) =>
      d3.line<number | null>().defined((d) => d !== null).x((_, i) => x(t[i])).y((d) => y(d as number))(ys)!;
    const gapShade = (y0: number, y1: number) =>
      svg.append('rect').attr('x', x(2017.5)).attr('width', x(2018.42) - x(2017.5)).attr('y', y0).attr('height', y1 - y0).attr('fill', 'var(--gap)');
    const xAxis = (yPos: number) =>
      svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${yPos})`).call(d3.axisBottom(x).ticks(small ? 5 : 10).tickFormat(d3.format('d')));
    const yAxis = (y: d3.ScaleLinear<number, number>, label: string) => {
      svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5));
      svg.append('text').attr('x', m.l + 6).attr('y', y.range()[1] + 10).text(label);
    };
    const vals = [...jpl, ...csr].filter((v): v is number => v !== null);
    const tt = d3.range(t[0], t[t.length - 1], 1 / 24);

    if (!split) {
      const y = d3.scaleLinear(d3.extent(vals) as [number, number], [H - m.b, m.t]).nice();
      gapShade(m.t, H - m.b);
      svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--line)');
      xAxis(H - m.b); yAxis(y, 'cm of water vs 2004–2009');
      svg.append('path').attr('d', line(csr, y)).attr('fill', 'none').attr('stroke', 'var(--csr)').attr('stroke-width', 1.2).attr('opacity', 0.9);
      svg.append('path').attr('d', line(jpl, y)).attr('fill', 'none').attr('stroke', 'var(--jpl)').attr('stroke-width', 1.6);
      svg.append('path').attr('d', d3.line<number>().x((d) => x(d)).y((d) => y(evalFit(fit, d, { trend: true })))(tt)!)
        .attr('fill', 'none').attr('stroke', 'var(--ink)').attr('stroke-width', 1.4).attr('stroke-dasharray', '5 4');
    } else {
      // two panels: (a) seasonal cycle = data minus fitted trend, with the fitted cycle; (b) trend = data minus fitted cycle
      const mid = Math.round(H * 0.42);
      const seas = jpl.map((v, i) => (v === null ? null : v - evalFit(fit, t[i], { trend: true })));
      const trend = jpl.map((v, i) => (v === null ? null : v - evalFit(fit, t[i], { seasonal: true })));
      const ya = d3.scaleLinear(d3.extent(seas.filter((v): v is number => v !== null)) as [number, number], [mid - 22, m.t + 12]).nice();
      const yb = d3.scaleLinear(d3.extent(trend.filter((v): v is number => v !== null)) as [number, number], [H - m.b, mid + 22]).nice();
      gapShade(m.t, mid - 22); gapShade(mid + 22, H - m.b);
      xAxis(mid - 22); xAxis(H - m.b);
      yAxis(ya, small ? '(a) data minus trend; grey = fitted yearly cycle, cm' : '(a) monsoon cycle: data minus trend (blue) and fitted yearly cycle (grey), cm'); yAxis(yb, small ? '(b) data minus cycle; dashed = trend, cm' : '(b) long-term change: data minus yearly cycle (blue) and fitted trend (dashed), cm');
      const pa = svg.append('path').attr('d', line(seas, ya)).attr('fill', 'none').attr('stroke', 'var(--jpl)').attr('stroke-width', 1.3);
      svg.append('path').attr('d', d3.line<number>().x((d) => x(d)).y((d) => ya(evalFit(fit, d, { seasonal: true })))(tt)!)
        .attr('fill', 'none').attr('stroke', 'var(--ink)').attr('stroke-width', 1).attr('opacity', 0.6);
      const pb = svg.append('path').attr('d', line(trend, yb)).attr('fill', 'none').attr('stroke', 'var(--jpl)').attr('stroke-width', 1.3);
      svg.append('path').attr('d', d3.line<number>().x((d) => x(d)).y((d) => yb(evalFit(fit, d, { trend: true })))(tt)!)
        .attr('fill', 'none').attr('stroke', 'var(--ink)').attr('stroke-width', 1.4).attr('stroke-dasharray', '5 4');
      svg.append('text').attr('x', W - m.r).attr('y', H - m.b - 8).attr('text-anchor', 'end')
        .text(`slope ${sign(fit.slope_cm_per_yr)} cm/yr · yearly amplitude ${fmt(fit.annual_amp_cm, 1)} cm`);
      if (animate && !reduced) {
        [pa, pb].forEach((p, k) => p.attr('opacity', 0).attr('transform', `translate(0,${k === 0 ? 40 : -40})`)
          .transition().duration(900).ease(d3.easeCubicOut).attr('opacity', 1).attr('transform', 'translate(0,0)'));
      } else if (animate) [pa, pb].forEach((p) => p.attr('opacity', 0).transition().duration(300).attr('opacity', 1));
    }
  }

  document.querySelectorAll<HTMLButtonElement>('#curve [data-cq]').forEach((b) =>
    b.addEventListener('click', () => {
      q = b.dataset.cq as 'gws' | 'tws';
      document.querySelectorAll<HTMLButtonElement>('#curve [data-cq]').forEach((o) => { o.classList.toggle('on', o === b); o.setAttribute('aria-pressed', String(o === b)); });
      render();
    }));
  const splitBtn = document.getElementById('curve-split') as HTMLButtonElement;
  splitBtn.addEventListener('click', () => {
    split = !split;
    splitBtn.setAttribute('aria-pressed', String(split));
    splitBtn.textContent = split ? 'Show combined curve' : 'Separate cycle and trend';
    render(true);
  });
  new ResizeObserver(() => render()).observe(el);
  render();

  // ---- cards (all numbers from meta.json)
  const h = meta.headline, rc = meta.rodell_crosscheck, pub = rc.published, o = rc.ours_same_period.jpl;
  const set = (id: string, html: string) => (document.getElementById(id)!.innerHTML = html);
  set('ours-cm', `${sign(h.gws_cm_per_yr)} ± ${fmt(h.gws_cm_per_yr_se, 2)} cm/yr`);
  set('ours-km3', `${sign(h.gws_km3_per_yr, 1)} ± ${fmt(h.gws_km3_per_yr_se, 1)} km³/yr`);
  set('ours-note', `Groundwater, NW India (Punjab, Haryana, Delhi, Rajasthan; ${fmt(meta.region.area_km2_grid_weighted, 0)} km²), ${monthLabel(h.period[0])} to ${monthLabel(h.period[1])}, ${h.n_months} months. JPL mascons minus GLDAS. ± is the formal fit error and a lower bound.`);
  set('rodell-cm', `${sign(pub.cm_per_yr, 1)} ± ${fmt(pub.cm_per_yr_unc, 1)} cm/yr`);
  set('rodell-km3', `${sign(pub.km3_per_yr, 1)} ± ${fmt(pub.km3_per_yr_unc, 1)} km³/yr`);
  set('rodell-note', `${pub.region}; ${pub.period}. <a href="https://doi.org/10.1038/nature08238" rel="noopener">Nature 460, 999–1002</a>. Values quoted from the paper.`);
  set('cross-cm', `${sign(o.cm_per_yr)} ± ${fmt(o.se, 2)} cm/yr`);
  set('cross-km3', `${sign(o.km3_per_yr, 1)} km³/yr`);
  set('cross-note', `Same months as Rodell et al. (${o.n_months} available). Ours is smaller than the published value and lies outside its ±1σ range. Different GRACE processing and land-model treatment; nothing was tuned to match.`);
  const s = h.sensitivity;
  set('sens-table', `<tr><th>Groundwater trend, full period</th><th>cm/yr</th><th>km³/yr</th></tr>
    <tr><td>JPL, no gain factors (headline)</td><td class="num">${sign(h.gws_cm_per_yr)}</td><td class="num">${sign(h.gws_km3_per_yr, 1)}</td></tr>
    <tr><td>JPL, gain factors applied</td><td class="num">${sign(s.jpl_with_gain_factors_cm_per_yr)}</td><td class="num">${sign(s.jpl_with_gain_factors_km3_per_yr, 1)}</td></tr>
    <tr><td>CSR mascons</td><td class="num">${sign(s.csr_cm_per_yr)}</td><td class="num">${sign(s.csr_km3_per_yr, 1)}</td></tr>`);
}

export async function initBar(): Promise<void> {
  const rs = await getJSON<RegionSeries>('data/region_series.json');
  const el = document.getElementById('bar-chart')!;
  const slider = document.getElementById('bar-slider') as HTMLInputElement;
  const out = document.getElementById('bar-month')!;
  const n = rs.months.length;
  slider.max = String(n - 1);
  const rows: [string, string, string][] = [
    ['tws_jpl', 'Total water storage (GRACE)', 'var(--ink)'],
    ['sm', '− Soil moisture (GLDAS)', '#8a6d3b'],
    ['swe', '− Snow (GLDAS)', '#7aa6c2'],
    ['can', '− Canopy water (GLDAS)', '#4f9a5d'],
    ['gws_jpl', '= Groundwater', 'var(--accent)'],
  ];
  const all = rows.flatMap(([k]) => rs.series[k]).filter((v): v is number => v !== null);
  const lim = Math.ceil(Math.max(...all.map(Math.abs)) / 10) * 10;

  function render(i: number) {
    out.textContent = monthLabel(rs.months[i]);
    slider.setAttribute('aria-valuetext', monthLabel(rs.months[i]));
    const W = el.clientWidth || 600, rowH = 38, m = { l: W < 520 ? 8 : 230, r: 64, t: 8, b: 24 };
    const stacked = W < 520;
    const H = m.t + rows.length * (rowH + (stacked ? 16 : 0)) + m.b;
    const x = d3.scaleLinear([-lim, lim], [m.l, W - m.r]);
    d3.select(el).selectAll('*').remove();
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(W < 520 ? 5 : 9));
    svg.append('text').attr('x', W - m.r).attr('y', H - 2).attr('text-anchor', 'end').text('cm of water');
    svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', 'var(--muted)');
    rows.forEach(([k, label, col], r) => {
      const v = rs.series[k][i];
      const y = m.t + r * (rowH + (stacked ? 16 : 0)) + (stacked ? 16 : 0);
      svg.append('text').attr('x', stacked ? 8 : m.l - 10).attr('y', stacked ? y - 4 : y + rowH / 2 + 2).attr('text-anchor', stacked ? 'start' : 'end')
        .style('fill', 'var(--ink)').style('font', '13px var(--sans)').text(label);
      if (v === null) {
        svg.append('text').attr('x', x(0) + 6).attr('y', y + rowH / 2 + 2).text('no data this month');
        return;
      }
      svg.append('rect').attr('x', Math.min(x(0), x(v))).attr('width', Math.abs(x(v) - x(0))).attr('y', y + 5).attr('height', rowH - 12).attr('fill', col).attr('rx', 2);
      svg.append('text').attr('x', v >= 0 ? x(v) + 5 : x(v) - 5).attr('y', y + rowH / 2 + 3).attr('text-anchor', v >= 0 ? 'start' : 'end')
        .style('fill', 'var(--ink)').text(sign(v, 1));
    });
  }
  const go = (i: number) => { const k = Math.max(0, Math.min(n - 1, i)); slider.value = String(k); render(k); };
  slider.addEventListener('input', () => render(+slider.value));
  document.getElementById('bar-prev')!.addEventListener('click', () => go(+slider.value - 1));
  document.getElementById('bar-next')!.addEventListener('click', () => go(+slider.value + 1));
  new ResizeObserver(() => render(+slider.value)).observe(el);
  go(Math.max(0, rs.months.indexOf('2010-08')));
}
