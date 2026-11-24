/**
 * ScreenLight — стартовый светофор на экране, сверху по центру: горизонтальный корпус
 * с пятью секциями (красная, три жёлтые, зелёная), нарисованный в SVG как настоящий:
 * крашеный металл с фаской и болтами, утопленные гнёзда с козырьками, линзы со светодиодной
 * сеткой и бликом; горящая лампа светится ореолом. Тот же порядок и те же вызовы,
 * что у дорожного StartLight (run / foul / stop). После зелёного уходит вверх.
 */
import { el } from './dom.js';

const COLORS = [
  // [имя, цвет свечения, светлый центр, тёмный край, погашенная линза: центр, край]
  ['red', '#ff2a1f', '#ffd2c4', '#8a0a06', '#7a2420', '#2c0a08'],
  ['amber', '#ffb81c', '#fff1c2', '#8a5200', '#7a5a1c', '#2c1e06'],
  ['amber', '#ffb81c', '#fff1c2', '#8a5200', '#7a5a1c', '#2c1e06'],
  ['amber', '#ffb81c', '#fff1c2', '#8a5200', '#7a5a1c', '#2c1e06'],
  ['green', '#2bff6a', '#d4ffe0', '#06702a', '#23663a', '#081f10'],
];
const W = 440;
const H = 104;
const STEP = 84;
const X0 = 52;
const CY = 50; // чуть выше середины: снизу — толщина корпуса
const R = 31; // линза

let uid = 0;

/** SVG светофора; у каждой секции — слой «горит» (.tl-on) и ореол (.tl-glow). */
function svg() {
  const id = `tl${(uid += 1)}`;
  const defs = [
    `<linearGradient id="${id}-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4a4d52"/><stop offset="0.12" stop-color="#33363b"/>
      <stop offset="0.7" stop-color="#25272b"/><stop offset="1" stop-color="#1a1b1e"/></linearGradient>`,
    // Мелкое зерно порошковой краски.
    `<pattern id="${id}-grain" width="3" height="3" patternUnits="userSpaceOnUse">
      <rect width="1" height="1" fill="#fff" fill-opacity="0.035"/><rect x="2" y="1" width="1" height="1" fill="#000" fill-opacity="0.08"/></pattern>`,
    `<linearGradient id="${id}-rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9a9da2"/><stop offset="1" stop-color="#1d1e21"/></linearGradient>`,
    `<radialGradient id="${id}-socket" cx="0.5" cy="0.42" r="0.6">
      <stop offset="0" stop-color="#0d0d0e"/><stop offset="0.8" stop-color="#050505"/>
      <stop offset="1" stop-color="#1e1f22"/></radialGradient>`,
    `<linearGradient id="${id}-visor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#55585d"/><stop offset="1" stop-color="#18191b"/></linearGradient>`,
    // Светодиоды линзы: мелкая сетка точек.
    `<pattern id="${id}-led" width="4.2" height="4.2" patternUnits="userSpaceOnUse">
      <circle cx="2.1" cy="2.1" r="1.15" fill="#fff" fill-opacity="0.22"/></pattern>`,
    `<pattern id="${id}-ledoff" width="4.2" height="4.2" patternUnits="userSpaceOnUse">
      <circle cx="2.1" cy="2.1" r="1.15" fill="#000" fill-opacity="0.35"/></pattern>`,
    `<filter id="${id}-glow" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="9"/></filter>`,
    `<filter id="${id}-shadow" x="-0.2" y="-0.5" width="1.4" height="2">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity="0.5"/></filter>`,
  ];
  const lamps = COLORS.map(([, glow, hot, edge, off, offEdge], i) => {
    const cx = X0 + i * STEP;
    const g = `${id}-l${i}`;
    defs.push(
      `<radialGradient id="${g}-on" cx="0.42" cy="0.38" r="0.62">
        <stop offset="0" stop-color="${hot}"/><stop offset="0.35" stop-color="${glow}"/>
        <stop offset="1" stop-color="${edge}"/></radialGradient>`,
      `<radialGradient id="${g}-off" cx="0.42" cy="0.38" r="0.65">
        <stop offset="0" stop-color="${off}"/><stop offset="0.7" stop-color="${offEdge}"/><stop offset="1" stop-color="#050505"/></radialGradient>`,
    );
    // Козырёк: дуга над гнездом, отбрасывает тень на верх линзы.
    const a0 = (200 * Math.PI) / 180;
    const a1 = (340 * Math.PI) / 180;
    const ro = R + 9;
    const ri = R + 2;
    const p = (r, a) => `${(cx + Math.cos(a) * r).toFixed(1)} ${(CY + Math.sin(a) * r).toFixed(1)}`;
    const visor = `M${p(ro, a0)} A${ro} ${ro} 0 0 1 ${p(ro, a1)} L${p(ri, a1)} A${ri} ${ri} 0 0 0 ${p(ri, a0)} Z`;
    return `<g class="tl-lamp" data-i="${i}">
      <circle class="tl-glow" cx="${cx}" cy="${CY}" r="${R + 10}" fill="${glow}" filter="url(#${id}-glow)"/>
      <circle cx="${cx}" cy="${CY}" r="${R + 6}" fill="url(#${id}-rim)"/>
      <circle cx="${cx}" cy="${CY}" r="${R + 4.4}" fill="url(#${id}-socket)"/>
      <circle cx="${cx}" cy="${CY}" r="${R}" fill="url(#${g}-off)"/>
      <circle cx="${cx}" cy="${CY}" r="${R}" fill="url(#${id}-ledoff)"/>
      <g class="tl-on">
        <circle cx="${cx}" cy="${CY}" r="${R}" fill="url(#${g}-on)"/>
        <circle cx="${cx}" cy="${CY}" r="${R}" fill="url(#${id}-led)"/>
      </g>
      <circle cx="${cx}" cy="${CY}" r="${R - 9}" fill="none" stroke="#fff" stroke-opacity="0.07" stroke-width="1"/>
      <circle cx="${cx}" cy="${CY}" r="${R - 18}" fill="none" stroke="#fff" stroke-opacity="0.06" stroke-width="1"/>
      <ellipse cx="${cx - 10}" cy="${CY - 13}" rx="11" ry="6" fill="#fff" fill-opacity="0.16" transform="rotate(-28 ${cx - 10} ${CY - 13})"/>
      <path d="${visor}" fill="url(#${id}-visor)"/>
      <path d="${visor}" fill="none" stroke="#000" stroke-opacity="0.45" stroke-width="0.8"/>
    </g>`;
  });
  const bolt = (x, y) =>
    `<circle cx="${x}" cy="${y}" r="3.2" fill="#2a2c2f"/><circle cx="${x - 0.6}" cy="${y - 0.6}" r="1.8" fill="#8d9095"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>${defs.join('')}</defs>
    <g filter="url(#${id}-shadow)">
      <rect x="1.5" y="4" width="${W - 3}" height="${H - 4}" rx="${(H - 4) / 2}" fill="#0b0c0d"/>
      <rect x="1.5" y="1.5" width="${W - 3}" height="${H - 6}" rx="${(H - 6) / 2}" fill="#111214"/>
      <rect x="4" y="3.5" width="${W - 8}" height="${H - 10}" rx="${(H - 10) / 2}" fill="url(#${id}-body)"/>
      <rect x="4" y="3.5" width="${W - 8}" height="${H - 10}" rx="${(H - 10) / 2}" fill="url(#${id}-grain)"/>
      <path d="M${H / 2} 5.2 H${W - H / 2}" stroke="#fff" stroke-opacity="0.22" stroke-width="1.2" stroke-linecap="round"/>
    </g>
    ${bolt(14, CY)}${bolt(W - 14, CY)}
    ${lamps.join('')}
  </svg>`;
}

export class ScreenLight {
  /**
   * @param {import('phaser').Scene & { ui: HTMLElement }} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.timers = [];
    this.node = el('div', { class: 'ui-abs screen-light', role: 'img', 'aria-label': 'Светофор' });
    this.node.innerHTML = svg();
    this.lamps = [...this.node.querySelectorAll('.tl-lamp')];
    scene.ui.append(this.node);
  }

  /** Какие лампы горят: индексы 0 — красная, 1–3 — жёлтые, 4 — зелёная. */
  show(on = []) {
    this.lamps.forEach((l, i) => l.classList.toggle('is-on', on.includes(i)));
  }

  /**
   * Запуск: красный, через redHold — жёлтые по одной (или все сразу при ambers = 1),
   * затем случайная пауза и зелёный. После зелёного светофор уходит через hideSec.
   * @param {{ redHoldSec: number, intervalSec: number, ambers: number, randomSec?: number }} cfg
   * @param {{ onAmber?: () => void, onGreen: () => void, onHide?: () => void, hideSec?: number }} cb
   */
  run(cfg, { onAmber, onGreen, onHide, hideSec = 1.4 }) {
    this.stop();
    this.node.classList.remove('is-gone');
    const s = this.scene;
    this.show([0]);
    const ambers = cfg.ambers >= 3 ? [[1], [1, 2], [1, 2, 3]] : [[1, 2, 3]];
    let t = cfg.redHoldSec * 1000;
    ambers.forEach((lit) => {
      this.timers.push(
        s.time.delayedCall(t, () => {
          this.show([0, ...lit]);
          onAmber?.();
        }),
      );
      t += cfg.intervalSec * 1000;
    });
    t += Math.random() * (cfg.randomSec ?? 0) * 1000;
    this.timers.push(
      s.time.delayedCall(t, () => {
        this.show([4]);
        onGreen();
        this.timers.push(
          s.time.delayedCall(hideSec * 1000, () => {
            this.hide();
            onHide?.();
          }),
        );
      }),
    );
  }

  /** Плавно убрать с экрана. */
  hide() {
    this.node.classList.add('is-gone');
  }

  /** Фальстарт: всё гаснет, красная мигает. */
  foul() {
    this.stop();
    this.node.classList.remove('is-gone');
    this.show([0]);
    let on = true;
    this.timers.push(
      this.scene.time.addEvent({
        delay: 160,
        repeat: 9,
        callback: () => {
          on = !on;
          this.show(on ? [0] : []);
        },
      }),
    );
  }

  stop() {
    for (const tm of this.timers) tm.remove(false);
    this.timers = [];
  }

  setVisible(on) {
    this.node.style.display = on ? '' : 'none';
  }
}
