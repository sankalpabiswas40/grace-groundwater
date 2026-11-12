// "Inside GRACE-FO": the list of units, the description card and its small diagrams.
// The 3D scene itself lives in inside3d.ts and is loaded only when 3D is available.
import { GROUPS, PARTS, PRESS_KIT, type Part } from './inside-data';

/** A small moving diagram of what a unit does (illustration only, not to scale). */
function diagram(p: Part): string {
  const wrap = (inner: string, alt: string) => `<svg class="part-anim" viewBox="0 0 200 64" role="img" aria-label="${alt}">${inner}</svg>`;
  const sat = (x: number) => `<path d="M${x - 14} 40h28l-6-13h-16z" fill="var(--ink)"/>`;
  switch (p.shape === 'horn' || p.id === 'mwa' ? 'range' : p.id === 'acc' || p.id === 'icu' ? 'acc' : p.group === 'Laser link' ? 'laser' : p.shape === 'camera' ? 'star' : p.shape === 'tank' ? 'gas' : p.id.startsWith('uso') ? 'clock' : '') {
    case 'range':
      return wrap(`${sat(30)}${sat(170)}<g fill="none" stroke="var(--accent)" stroke-width="1.6">
        <path class="wv w1" d="M52 22q6 11 0 22"/><path class="wv w2" d="M52 22q6 11 0 22"/><path class="wv w3" d="M52 22q6 11 0 22"/></g>
        <text x="100" y="58" text-anchor="middle">microwaves to the other satellite</text>`, 'Microwave signals travelling between the two satellites');
    case 'laser':
      return wrap(`${sat(30)}${sat(170)}<line class="lz" x1="46" y1="30" x2="154" y2="30" stroke="#e5483b" stroke-width="2" stroke-dasharray="6 5"/>
        <line class="lz back" x1="154" y1="37" x2="46" y2="37" stroke="#e5483b" stroke-width="2" stroke-dasharray="6 5" opacity=".6"/>
        <text x="100" y="58" text-anchor="middle">laser out and back, parallel</text>`, 'A laser beam going to the other satellite and returning parallel');
    case 'acc':
      return wrap(`<rect x="72" y="10" width="56" height="36" fill="none" stroke="var(--ink)" stroke-width="1.5"/><rect class="pm" x="92" y="20" width="16" height="16" fill="var(--accent)"/>
        <path class="drag" d="M10 28h44m-8-6 8 6-8 6" fill="none" stroke="#b0541a" stroke-width="2"/>
        <text x="100" y="58" text-anchor="middle">a floating mass senses drag</text>`, 'A small mass floating inside a cage while drag pushes on the satellite');
    case 'star':
      return wrap(`<path d="M100 46 76 10h48z" fill="var(--accent)" opacity=".18"/><rect x="92" y="42" width="16" height="10" fill="var(--ink)"/>
        <g fill="var(--ink)"><circle class="st s1" cx="88" cy="16" r="1.6"/><circle class="st s2" cx="104" cy="12" r="1.6"/><circle class="st s3" cx="112" cy="24" r="1.6"/><circle class="st s1" cx="96" cy="26" r="1.2"/></g>
        <text x="100" y="62" text-anchor="middle">stars give the pointing</text>`, 'A camera looking at stars to find its orientation');
    case 'gas':
      return wrap(`<circle cx="60" cy="28" r="17" fill="none" stroke="var(--ink)" stroke-width="1.5"/><path d="M77 28h40" stroke="var(--ink)" stroke-width="1.5"/>
        <g fill="var(--accent)"><circle class="pf p1" cx="122" cy="28" r="3"/><circle class="pf p2" cx="122" cy="28" r="3"/><circle class="pf p3" cx="122" cy="28" r="3"/></g>
        <text x="100" y="58" text-anchor="middle">small puffs of nitrogen</text>`, 'A tank feeding small puffs of nitrogen gas');
    case 'clock':
      return wrap(`<path class="osc" d="M20 28 q10 -22 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0" fill="none" stroke="var(--accent)" stroke-width="2"/>
        <text x="100" y="58" text-anchor="middle">a very steady frequency</text>`, 'A steady oscillating signal');
    default: return '';
  }
}

export async function initInside(tier: 'full' | 'lite' | 'static'): Promise<void> {
  const list = document.getElementById('inside-list')!;
  const card = document.getElementById('inside-card')!;
  const showCard = (p: Part | null) => {
    card.innerHTML = p
      ? `<p class="card-tag">${p.group}</p><h3>${p.name}</h3>${diagram(p)}<p>${p.does}</p><p class="small muted">Built by: ${p.built}. Source: <a href="${PRESS_KIT}" rel="noopener">NASA/JPL GRACE-FO press kit</a>.</p>`
      : '<p class="card-tag">How to use</p><h3>Scroll, or tap the satellite, to open it</h3><p>Then tap any unit, or a name in the list, to see what it does. Tap empty space to step back.</p>';
    list.querySelectorAll('button').forEach((b) => b.classList.toggle('on', !!p && b.dataset.id === p.id));
  };
  let select: (id: string) => void = (id) => showCard(PARTS.find((p) => p.id === id) ?? null);
  GROUPS.forEach((g) => {
    const row = document.createElement('div'); row.className = 'inside-group';
    row.innerHTML = `<span class="inside-gname">${g}</span>`;
    PARTS.filter((p) => p.group === g).forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.dataset.id = p.id; b.textContent = p.name;
      b.addEventListener('click', () => select(p.id));
      row.appendChild(b);
    });
    list.appendChild(row);
  });
  showCard(null);
  if (tier === 'static') { document.getElementById('inside-fallback')!.hidden = false; return; }
  const scene = await (await import('./inside3d')).buildInside(tier, showCard);
  select = (id) => scene.select(id);
}
