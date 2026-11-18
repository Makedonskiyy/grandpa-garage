#!/usr/bin/env node
/**
 * build-hud — педали и лепестки переключения для приборной панели заездов (SVG).
 * Не пиксельные, а «настоящие»: шлифованный алюминий с резиновыми накладками, лепестки
 * из карбона на металлическом кронштейне. Всё нарисовано здесь, без чужих картинок.
 * Приборы (тахометр и спидометр) рисуются в игре кодом — src/ui/gauges.js.
 *
 *   npm run hud → public/assets/images/hud/*.svg
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../public/assets/images/hud/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const defs = `
  <linearGradient id="al" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="#fdfdfe"/>
    <stop offset="0.4" stop-color="#d7dade"/>
    <stop offset="0.55" stop-color="#b6bac0"/>
    <stop offset="0.75" stop-color="#dfe2e5"/>
    <stop offset="1" stop-color="#c3c7cc"/>
  </linearGradient>
  <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#a4a8ae"/>
    <stop offset="1" stop-color="#43474c"/>
  </linearGradient>
  <linearGradient id="rub" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#0b0c0e"/>
    <stop offset="0.45" stop-color="#2c2e33"/>
    <stop offset="1" stop-color="#0f1012"/>
  </linearGradient>
  <filter id="brush" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9 0.012" numOctaves="2" seed="7"/>
    <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.25 0"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="shadow" x="-20%" y="-15%" width="140%" height="140%">
    <feDropShadow dx="0" dy="10" stdDeviation="8" flood-opacity="0.6"/>
  </filter>`;

/** Резиновая накладка: тёмная полоса, блик сбоку и светлая кромка снизу. */
const strip = (x, y, w, h) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w / 2}" fill="url(#rub)"/>` +
  `<rect x="${x + w * 0.28}" y="${y + 5}" width="2" height="${h - 10}" rx="1" fill="#5c6067" opacity="0.8"/>` +
  `<rect x="${x + 1}" y="${y + h - 1}" width="${w - 2}" height="2" rx="1" fill="#fff" opacity="0.6"/>`;

/** Педаль: металлическая площадка (path) с накладками. */
function pedal({ w, h, plate, strips }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
  <defs>${defs}
    <clipPath id="plate"><path d="${plate}"/></clipPath>
  </defs>
  <g filter="url(#shadow)">
    <path d="${plate}" fill="url(#edge)" transform="translate(0 3)"/>
    <path d="${plate}" fill="url(#al)"/>
  </g>
  <g clip-path="url(#plate)">
    <rect width="${w}" height="${h}" fill="#fff" filter="url(#brush)"/>
    <rect width="${w}" height="${h * 0.08}" fill="#fff" opacity="0.45"/>
  </g>
  <path d="${plate}" fill="none" stroke="#7d8187" stroke-width="2"/>
  ${strips.join('')}
</svg>
`;
}

// Тормоз — широкая площадка, восемь накладок.
const BW = 240;
const BH = 160;
const brakeStrips = [];
for (let i = 0; i < 8; i++) brakeStrips.push(strip(30 + i * 24, 34, 12, 88));
writeFileSync(
  `${OUT}pedal_brake.svg`,
  pedal({
    w: BW,
    h: BH,
    plate: 'M36 10 H204 Q230 10 230 36 V118 Q230 144 204 144 H36 Q10 144 10 118 V36 Q10 10 36 10 Z',
    strips: brakeStrips,
  }),
);

// Газ — высокая, сужается книзу, пять накладок.
const GW = 160;
const GH = 270;
const gasStrips = [];
for (let i = 0; i < 5; i++) gasStrips.push(strip(33 + i * 20, 34, 13, 186));
writeFileSync(
  `${OUT}pedal_gas.svg`,
  pedal({
    w: GW,
    h: GH,
    plate:
      'M34 10 H126 Q148 10 147 32 L138 226 Q136 252 112 252 H48 Q24 252 22 226 L13 32 Q12 10 34 10 Z',
    strips: gasStrips,
  }),
);

/**
 * Лепесток: карбоновое перо на алюминиевом кронштейне, знак «−» или «+».
 * Левый лепесток нарисован как есть, правый — зеркально.
 */
function paddle(sign, mirror) {
  const W = 200;
  const H = 260;
  const blade =
    'M70 24 C110 8 160 14 180 40 C190 70 188 150 176 196 C150 222 98 226 70 210 C58 160 56 70 70 24 Z';
  const body = `
  <g filter="url(#shadow)">
    <path d="M18 104 H86 Q96 104 96 114 V150 Q96 160 86 160 H18 Q8 160 8 150 V114 Q8 104 18 104 Z" fill="url(#al)" stroke="#6f737a" stroke-width="2"/>
    <rect x="8" y="122" width="88" height="6" fill="#fff" opacity="0.35"/>
    <path d="${blade}" fill="#111214"/>
    <path d="${blade}" fill="url(#cf)"/>
    <path d="${blade}" fill="url(#gloss)"/>
    <path d="${blade}" fill="none" stroke="#9ba1a9" stroke-width="3"/>
  </g>
  <circle cx="44" cy="132" r="10" fill="url(#edge)" stroke="#2a2c30" stroke-width="2"/>
  <circle cx="44" cy="132" r="4" fill="#1b1c1f"/>`;
  const mark = sign === '+' ? 'M110 118 H146 M128 100 V136' : 'M110 118 H146';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>${defs}
    <pattern id="cf" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="10" height="10" fill="#17181b"/>
      <rect width="5" height="5" fill="#2e3035"/>
      <rect x="5" y="5" width="5" height="5" fill="#26282d"/>
    </pattern>
    <linearGradient id="gloss" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.32"/>
      <stop offset="0.45" stop-color="#fff" stop-opacity="0.04"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.35"/>
    </linearGradient>
  </defs>
  <g${mirror ? ` transform="translate(${W} 0) scale(-1 1)"` : ''}>${body}</g>
  <path d="${mark}"${mirror ? ` transform="translate(${W} 0) scale(-1 1)"` : ''} fill="none" stroke="#f2f3f5" stroke-width="9" stroke-linecap="round"/>
</svg>
`;
}
writeFileSync(`${OUT}paddle_down.svg`, paddle('−', true));
writeFileSync(`${OUT}paddle_up.svg`, paddle('+', false));
console.log('✓ public/assets/images/hud: pedal_brake, pedal_gas, paddle_down, paddle_up');
