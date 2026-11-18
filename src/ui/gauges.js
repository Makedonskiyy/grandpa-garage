/**
 * Стрелочные приборы заездов — тахометр и спидометр в SVG (не пиксельные, «настоящие»):
 * хромированная обечайка, чёрный циферблат, деления и цифры, красная зона, стрелка
 * со свечением и окошко с цифрами. Видна верхняя часть прибора — низ уходит за край
 * экрана, как приборная панель за рулём.
 *
 * Тахометр — главный прибор: в окошке передача, на шкале зелёная дуга «переключайся»
 * (до старта — «трогайся»), при попадании в неё обечайка загорается зелёным, на отсечке
 * — рамка окошка (без внешнего свечения). Спидометр — поменьше, в окошке скорость цифрами.
 */
const NS = 'http://www.w3.org/2000/svg';
// Шкала на 200°: ноль чуть ниже горизонтали слева — виден, хотя низ прибора за краем экрана.
const START = -100; // угол нуля шкалы от вертикали, градусы
const SWEEP = 200;
let uid = 0;

const rad = (d) => (d * Math.PI) / 180;
const pt = (r, deg) => [r * Math.sin(rad(deg)), -r * Math.cos(rad(deg))];

function svg(tag, attrs = {}, parent = null) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  parent?.append(n);
  return n;
}

/** Дуга по шкале от значения a до b (в долях 0–1) на радиусе r. */
function arcPath(r, from, to) {
  const a0 = START + SWEEP * from;
  const a1 = START + SWEEP * to;
  const [x0, y0] = pt(r, a0);
  const [x1, y1] = pt(r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * @param {{ max: number, major: number, minor: number, label: (v: number) => string,
 *   unit: string, red?: number, className?: string, window?: 'gear'|'number' }} o
 *   max — конец шкалы; major — шаг подписей; minor — делений между подписями;
 *   red — с какого значения красная зона.
 */
export function createGauge(o) {
  const id = `g${(uid += 1)}`;
  const root = document.createElement('div');
  root.className = `gauge ${o.className ?? ''}`.trim();
  const s = svg('svg', { viewBox: '-200 -200 400 400', 'aria-hidden': 'true' });
  root.append(s);

  const defs = svg('defs', {}, s);
  const chrome = svg('linearGradient', { id: `${id}c`, x1: 0, y1: 0, x2: 0.6, y2: 1 }, defs);
  for (const [off, c] of [
    [0, '#ffffff'],
    [0.22, '#b9bec6'],
    [0.48, '#4c5058'],
    [0.62, '#e8ebef'],
    [1, '#6d727a'],
  ])
    svg('stop', { offset: off, 'stop-color': c }, chrome);
  const face = svg('radialGradient', { id: `${id}f`, cx: 0.5, cy: 0.42, r: 0.62 }, defs);
  svg('stop', { offset: 0, 'stop-color': '#23252b' }, face);
  svg('stop', { offset: 0.7, 'stop-color': '#0c0d10' }, face);
  svg('stop', { offset: 1, 'stop-color': '#030304' }, face);
  const cap = svg('radialGradient', { id: `${id}k`, cx: 0.35, cy: 0.3, r: 0.8 }, defs);
  svg('stop', { offset: 0, 'stop-color': '#f2f4f6' }, cap);
  svg('stop', { offset: 0.5, 'stop-color': '#7b8089' }, cap);
  svg('stop', { offset: 1, 'stop-color': '#2a2d32' }, cap);

  // Обечайка, тёмное кольцо, циферблат, блик стекла.
  svg('circle', { r: 198, fill: `url(#${id}c)` }, s);
  const ring = svg('circle', { r: 186, fill: '#0a0b0d', class: 'gauge__ring' }, s);
  svg('circle', { r: 180, fill: `url(#${id}f)` }, s);

  // Красная зона и зелёная дуга переключения.
  if (o.red !== undefined) {
    svg(
      'path',
      {
        d: arcPath(170, o.red / o.max, 1),
        fill: 'none',
        stroke: '#d6232b',
        'stroke-width': 14,
      },
      s,
    );
  }
  const zone = svg(
    'path',
    {
      d: arcPath(170, 0, 0),
      fill: 'none',
      stroke: '#41d36b',
      'stroke-width': 14,
      class: 'gauge__zone',
      visibility: 'hidden',
    },
    s,
  );

  // Деления и цифры.
  const steps = Math.round(o.max / o.major);
  for (let i = 0; i <= steps * o.minor; i++) {
    const v = (i / o.minor) * o.major;
    const deg = START + (SWEEP * v) / o.max;
    const isMajor = i % o.minor === 0;
    const inRed = o.red !== undefined && v >= o.red;
    const [x0, y0] = pt(isMajor ? 148 : 160, deg);
    const [x1, y1] = pt(178, deg);
    svg(
      'line',
      {
        x1: x0.toFixed(2),
        y1: y0.toFixed(2),
        x2: x1.toFixed(2),
        y2: y1.toFixed(2),
        stroke: inRed ? '#ff4b52' : '#f4f4f2',
        'stroke-width': isMajor ? 5 : 2.4,
        'stroke-linecap': 'round',
      },
      s,
    );
    if (isMajor) {
      const [tx, ty] = pt(118, deg);
      const t = svg(
        'text',
        {
          x: tx.toFixed(2),
          y: (ty + 12).toFixed(2),
          'text-anchor': 'middle',
          class: 'gauge__num',
          fill: inRed ? '#ff4b52' : '#f4f4f2',
        },
        s,
      );
      t.textContent = o.label(v);
    }
  }
  const unit = svg('text', { x: 0, y: 48, 'text-anchor': 'middle', class: 'gauge__unit' }, s);
  unit.textContent = o.unit;

  // Окошко с цифрами — над осью стрелки: низ прибора спрятан за краем экрана.
  const win = svg(
    'rect',
    {
      x: -58,
      y: -94,
      width: 116,
      height: 54,
      rx: 12,
      fill: '#050607',
      stroke: '#2b2e34',
      'stroke-width': 2,
    },
    s,
  );
  const readout = svg(
    'text',
    { x: 0, y: -51, 'text-anchor': 'middle', class: 'gauge__readout' },
    s,
  );
  const sub = svg('text', { x: 0, y: -27, 'text-anchor': 'middle', class: 'gauge__sub' }, s);

  // Стрелка и колпачок.
  const needle = svg('g', { class: 'gauge__needle' }, s);
  svg('path', { d: 'M-7 26 L-2.6 -166 L2.6 -166 L7 26 Z', fill: '#ff2a2f' }, needle);
  svg('circle', { r: 22, fill: `url(#${id}k)`, stroke: '#16171a', 'stroke-width': 3 }, s);
  svg(
    'ellipse',
    { cx: -50, cy: -120, rx: 120, ry: 52, fill: '#fff', opacity: 0.05, transform: 'rotate(-24)' },
    s,
  );

  let shown = 0;
  return {
    node: root,
    /**
     * @param {{ value: number, text?: string, sub?: string, zone?: [number, number]|null,
     *   inZone?: boolean, alarm?: boolean }} st
     */
    render({ value, text = '', sub: subText = '', zone: z = null, inZone = false, alarm = false }) {
      // Стрелка догоняет значение мягко — как у настоящего прибора, без дрожи.
      shown += (Math.min(value, o.max * 1.02) - shown) * 0.35;
      needle.setAttribute('transform', `rotate(${(START + (SWEEP * shown) / o.max).toFixed(2)})`);
      readout.textContent = text;
      sub.textContent = subText;
      if (z) {
        zone.setAttribute('d', arcPath(170, Math.max(0, z[0] / o.max), Math.min(1, z[1] / o.max)));
        zone.setAttribute('visibility', 'visible');
      } else zone.setAttribute('visibility', 'hidden');
      root.classList.toggle('is-zone', inZone);
      root.classList.toggle('is-alarm', alarm);
      ring.setAttribute('fill', '#0a0b0d');
      // Сигнал прямо в приборе: зелёная рамка окошка — переключайся, красная — отсечка.
      win.setAttribute('stroke', alarm ? '#ff3b40' : inZone ? '#41d36b' : '#2b2e34');
      win.setAttribute('stroke-width', alarm || inZone ? 4 : 2);
    },
  };
}
