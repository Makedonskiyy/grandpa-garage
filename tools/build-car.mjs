#!/usr/bin/env node
/**
 * build-car — генератор модульной машины игрока («дедова японка»).
 *
 * Пропорции — купе конца 90-х по образцу R34: длина 4,6 м, база 2,67 м, высота 1,36 м,
 * колёса 18″. Марок, шильдиков и названий нет (ТЗ 2.1).
 *
 * Геометрия задана в единицах мира (288×96 на машину, 1 ед. ≈ 17 мм), а растеризуется
 * в DENSITY раз детальнее — машина чётче всех остальных объектов игры. Без сглаживания
 * (crispEdges), свет и тени — ступенями, как в пиксель-арте.
 *
 * Слои одного размера с общей привязкой (ТЗ 5.1). Краска, спойлер, диски и стекло фар —
 * в серой шкале: игра перекрашивает их умножением (setTint), тени и блики сохраняются.
 *
 *   npm run car              — собрать в public/assets/images/car и data/car.json
 *   npm run car -- --preview — плюс превью в art/preview/car.png
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}public/assets/images/car/`;
const PREVIEW = process.argv.includes('--preview');

const DENSITY = 3; // пикселей текстуры на единицу мира
const W = 288;
const H = 96;
const GROUND = 92;

// ---------- Пропорции ----------
const WHEEL_R = 19;
const WHEEL_Y = GROUND - WHEEL_R; // 72.5
const REAR_X = 63;
const FRONT_X = 228;
const ARCH_R = 22;
const SILL = 82; // низ порога
const SKIRT = 77.5; // верх юбки порога
const FRAME = 48; // кадр колеса, ед.
const FRAMES = 16;
const STEP = 1 / DENSITY; // одна точка текстуры в единицах мира

const C = {
  outline: '#0d0e12',
  well: '#09090c',
  trim: '#18191e',
  trimHi: '#2a2c33',
  trimLo: '#101115',
  rubber: '#1b1c20',
  rubberSide: '#25262b',
  rubberHi: '#3b3d44',
  glassTop: '#5d7393',
  glassMid: '#2c3a55',
  glassLow: '#18202f',
  glassDeep: '#10151f',
  glassShine: '#a9bcd6',
  tail: '#9e1b26',
  tailHi: '#e0454d',
  tailLo: '#5e0f15',
  marker: '#e08c2c',
  metal: '#7a7e86',
  metalHi: '#b8bcc4',
  metalDark: '#45484f',
  disc: '#6f737a',
  discHi: '#9a9ea6',
  discDark: '#4d5056',
  caliperRed: '#b3262c',
  caliperRedHi: '#e04a4a',
  caliperGrey: '#5c6067',
  brick: '#8e4a33',
  brickHi: '#a85a3e',
  brickDark: '#5e2f21',
  mortar: '#b9a48a',
};

/** Серая ступень для перекрашиваемых слоёв: 0…1 → #rrggbb. */
const gray = (v) => {
  const n = Math.round(Math.max(0, Math.min(1, v)) * 255);
  const h = n.toString(16).padStart(2, '0');
  return `#${h}${h}${h}`;
};

// ---------- Силуэт ----------
const arch = (cx) => {
  const dx = Math.sqrt(ARCH_R ** 2 - (SILL - WHEEL_Y) ** 2);
  return { a: (cx + dx).toFixed(2), b: (cx - dx).toFixed(2) };
};
const FA = arch(FRONT_X);
const RA = arch(REAR_X);

const BODY_PATH = [
  'M 12 81.5',
  'Q 8 80.5 8 76', // низ заднего бампера
  'L 7 58',
  'L 7.5 40',
  'Q 8 33.5 12 32.6', // скругление заднего торца
  'L 48 31.5', // багажник — выше линии капота
  'L 98 12.6', // длинное пологое заднее стекло
  'Q 100.5 11.6 104 11.6', // крыша
  'L 152 11.6',
  'Q 155.5 11.8 158 13.4',
  'L 195 38.6', // лобовое
  'L 230 42.5', // короткий капот, опускается к носу
  'L 256 46.6',
  'Q 266 48.2 270.5 50.4', // скругление носа
  'Q 274 52.4 275.5 56.5',
  'L 279.2 66', // лицо скошено вперёд к губе
  'Q 280.6 74 279.6 78.6', // передний бампер
  `L 277 ${SILL}`,
  `L ${FA.a} ${SILL}`,
  `A ${ARCH_R} ${ARCH_R} 0 1 0 ${FA.b} ${SILL}`,
  `L ${RA.a} ${SILL}`,
  `A ${ARCH_R} ${ARCH_R} 0 1 0 ${RA.b} ${SILL}`,
  'L 16 81.2',
  'Z',
].join(' ');

// Боковое остекление: большое дверное стекло и маленькая форточка, нижняя кромка
// окон поднимается к стойке C; между стёклами — чёрная стойка B (39 % длины).
const DOOR_GLASS = 'M 115.5 14.6 L 151 14.4 Q 153.5 14.6 155 15.8 L 189.5 37.8 L 115.5 37.2 Z';
const QUARTER_GLASS =
  'M 111.5 14.6 L 111.5 36.8 L 92 35.6 L 87 33.8 L 96.5 16.8 Q 98 14.8 101 14.6 Z';
const B_PILLAR = 'M 111.5 14.2 L 115.5 14.2 L 115.5 37.4 L 111.5 37 Z';
const A_PILLAR = 'M 158 13.4 L 195 38.6 L 191 38.8 L 156.5 14.6 Z';
const C_PILLAR_EDGE = 'M 98 12.6 L 48 31.5 L 53 31.5 L 100 13.3 Z';
const HEADLIGHT =
  'M 257.5 47.6 L 268.6 48.8 Q 272.2 50.2 273.6 53.6 L 260.4 54.6 Q 258.4 51.4 257.5 47.6 Z';
const HEADLIGHT_LENS =
  'M 260 49.2 L 268 50.2 Q 270.8 51.2 271.6 53.2 L 261.6 53.8 Q 260.4 51.6 260 49.2 Z';
const INTAKE = 'M 268.5 64.5 L 279.4 64.5 L 280.1 71 L 270.4 71.6 Q 268.8 68.4 268.5 64.5 Z';
const VENT = 'M 201.5 51 L 207 51 L 206.4 57.6 L 202.2 57.6 Z'; // жабры за передним колесом

const svg = (body, { w = W, h = H } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w * DENSITY}" height="${h * DENSITY}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`;

const rect = (x, y, w, h, fill, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;

function rng(seed) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

const defs = `
  <clipPath id="body"><path d="${BODY_PATH}"/></clipPath>
  <clipPath id="glass"><path d="${DOOR_GLASS}"/><path d="${QUARTER_GLASS}"/></clipPath>
`;

/**
 * Ступенчатый вертикальный градиент: значения в опорных точках по y, между ними —
 * линейно, затем округление до levels ступеней (пиксельная «лестница» света).
 */
function stepGradient(stops, y0, y1, x0, x1, levels, color = gray) {
  const value = (y) => {
    for (let i = 0; i < stops.length - 1; i++) {
      const [ya, va] = stops[i];
      const [yb, vb] = stops[i + 1];
      if (y >= ya && y <= yb) return va + ((vb - va) * (y - ya)) / (yb - ya || 1);
    }
    return y < stops[0][0] ? stops[0][1] : stops.at(-1)[1];
  };
  let out = '';
  const rows = Math.round((y1 - y0) * DENSITY);
  let start = 0;
  let prev = Math.round(value(y0) * levels) / levels;
  for (let i = 1; i <= rows; i++) {
    const v = i < rows ? Math.round(value(y0 + i * STEP) * levels) / levels : null;
    if (v !== prev) {
      out += rect(
        x0,
        (y0 + start * STEP).toFixed(3),
        x1 - x0,
        ((i - start) * STEP).toFixed(3),
        color(prev),
      );
      start = i;
      prev = v;
    }
  }
  return out;
}

// ---------- Слои кузова ----------

function layerWells() {
  const well = (cx) => `<circle cx="${cx}" cy="${WHEEL_Y}" r="${ARCH_R - 0.4}" fill="${C.well}"/>`;
  return svg(`
    <defs><clipPath id="above"><rect x="0" y="0" width="${W}" height="${SILL}"/></clipPath></defs>
    <g clip-path="url(#above)">${well(REAR_X)}${well(FRONT_X)}</g>
  `);
}

/** Всё неокрашиваемое: стёкла, стойки, чёрный пластик, фонари, решётки. */
function nonPaint(maskFill) {
  const f = (c) => maskFill ?? c;
  return `
    <path d="${DOOR_GLASS}" fill="${f(C.glassMid)}"/>
    <path d="${QUARTER_GLASS}" fill="${f(C.glassMid)}"/>
    <path d="${B_PILLAR}" fill="${f(C.trim)}"/>
    <path d="${A_PILLAR}" fill="${f(C.trimLo)}"/>
    <path d="${C_PILLAR_EDGE}" fill="${f(C.glassDeep)}"/>
    <path d="${HEADLIGHT}" fill="${f(C.trim)}"/>
    <path d="${INTAKE}" fill="${f(C.trimLo)}"/>
    <path d="${VENT}" fill="${f(C.trimLo)}"/>
    ${rect(7, 37, 2.6, 9, f(C.tail))}
    ${rect(8, 72, 34, 9.5, f(C.trim))}
    <path d="M 248 78.6 L 279.6 78.6 L 282.2 81.2 L 280.8 82.4 L 250 82.6 Z" fill="${f(C.trim)}"/>
    ${rect(83, 80.5, 125, 2, f(C.trimLo))}
    <path d="M 182 32.2 Q 182 30.6 184 30.6 L 190.6 31.2 Q 192.4 31.6 192.2 33.6 L 191.6 36.4 L 183 36.4 Q 182 36.4 182 34.8 Z" fill="${f(C.trim)}"/>
    ${rect(187, 36, 3, 2, f(C.trim))}
  `;
}

function layerBase() {
  // Ступенчатое стекло: светлое небо сверху, тёмный салон снизу, диагональный блик.
  const glassColors = [C.glassDeep, C.glassLow, C.glassMid, '#3f5070', C.glassTop, '#7d93b3'];
  const glass = stepGradient(
    [
      [14, 0.95],
      [20, 0.55],
      [29, 0.2],
      [38, 0.05],
    ],
    14,
    38,
    80,
    196,
    5,
    (v) => glassColors[Math.round(v * 5)],
  );
  let mesh = '';
  for (let y = 65.6; y < 71; y += 1.8) mesh += rect(270, y, 9.6, 0.6, C.trimHi);
  let slats = '';
  for (let x = 203; x < 207; x += 1.6) slats += rect(x, 52, 0.6, 5, C.trimHi);
  return svg(`
    <defs>${defs}</defs>
    <path d="${BODY_PATH}" fill="${C.outline}"/>
    <g clip-path="url(#body)">
      ${nonPaint()}
      <g clip-path="url(#glass)">
        ${glass}
        <path d="M 128 15 L 137 15 L 121 37 L 112 37 Z" fill="${C.glassShine}" opacity="0.35"/>
        <path d="M 140 15 L 143 15 L 127 37 L 124 37 Z" fill="${C.glassShine}" opacity="0.25"/>
        <!-- силуэт сиденья в салоне -->
        <path d="M 124 37 L 125 26 Q 126 22.6 129 22.6 L 131 22.6 Q 133 22.6 132.5 26 L 131 37 Z" fill="${C.glassDeep}"/>
      </g>
      <!-- задний фонарь, загнутый на бок -->
      ${rect(7, 37.6, 1.6, 3.4, C.tailHi)}
      ${rect(7, 42.5, 2.6, 3.5, C.tailLo)}
      <!-- решётка воздухозаборника и сплиттер -->
      ${mesh}
      ${rect(252, 80.2, 28, 0.8, C.trimHi)}
      <!-- диффузор сзади -->
      ${rect(10, 77.5, 30, 0.7, C.trimHi)}
      <!-- жабры -->
      ${slats}
      <!-- зеркало: блик -->
      ${rect(183.4, 31.4, 7.6, 0.8, C.trimHi)}
      <!-- юбка порога: ребро -->
      ${rect(85, 80.5, 121, 0.6, C.trimHi)}
      <!-- боковой повторитель -->
      ${rect(262, 59.4, 2.6, 1.2, C.marker)}
    </g>
    <path d="${BODY_PATH}" fill="none" stroke="${C.outline}" stroke-width="${STEP * 2}"/>
    <path d="${DOOR_GLASS}" fill="none" stroke="${C.trim}" stroke-width="${STEP * 2}"/>
    <path d="${QUARTER_GLASS}" fill="none" stroke="${C.trim}" stroke-width="${STEP * 2}"/>
  `);
}

/** Краска: свет неба сверху, тень под плечом, отражение земли внизу; торцы темнее. */
function layerPaint() {
  const side = stepGradient(
    [
      [11.6, 0.98],
      [15, 0.9],
      [31, 0.88],
      [33, 0.97],
      [38.6, 0.95],
      [39.3, 1],
      [40.3, 0.74],
      [46, 0.8],
      [58, 0.78],
      [68, 0.7],
      [74, 0.66],
      [SKIRT, 0.6],
      [SKIRT + 0.4, 0.86],
      [SKIRT + 1.2, 0.58],
      [SILL, 0.5],
    ],
    11.6,
    SILL,
    0,
    W,
    14,
  );
  const hoodEdge = `<path d="M 195 38.6 L 230 42.5 L 256 46.6 L 256 47.6 L 230 43.6 L 195 39.8 Z" fill="${gray(1)}"/>`;
  const shoulder = `<path d="M 9 38.4 L 190 39.4 L 244 45.4 L 244 46.4 L 190 40.6 L 9 39.6 Z" fill="${gray(1)}"/>`;
  const streak = `<path d="M 134 42 L 166 42 L 144 77 L 112 77 Z" fill="${gray(0.83)}" opacity="0.6"/>`;
  const ends = `
    <rect x="0" y="31" width="5" height="52" fill="${gray(0.62)}"/>
    <rect x="5" y="31" width="4" height="52" fill="${gray(0.7)}"/>
    <rect x="275" y="54" width="13" height="34" fill="${gray(0.66)}"/>
    <rect x="270" y="54" width="5" height="30" fill="${gray(0.74)}"/>
  `;
  const haunch = `<path d="M 36 44 Q 63 39.6 96 42.6 L 96 43.4 Q 63 40.6 36 45 Z" fill="${gray(1)}"/><path d="M 36 45 Q 63 40.8 96 43.4 L 96 45.2 Q 63 42.6 36 46.6 Z" fill="${gray(0.72)}"/>`;
  const flare = (cx) => `
    <circle cx="${cx}" cy="${WHEEL_Y}" r="${ARCH_R + 0.9}" fill="none" stroke="${gray(0.62)}" stroke-width="0.8"/>
  `;
  const seams = `
    <path d="M 190.5 38.8 L 191.5 46 Q 192.5 70 190.5 80.5" fill="none" stroke="${C.outline}" stroke-width="${STEP * 1.5}"/>
    <path d="M 113.5 37.2 L 113.5 80.5" fill="none" stroke="${C.outline}" stroke-width="${STEP * 1.5}"/>
    <path d="M 230 42.6 Q 238 47 254 48.4" fill="none" stroke="${gray(0.6)}" stroke-width="${STEP * 1.5}"/>
    ${rect(117.5, 41.4, 7.5, 1.6, C.outline, 'rx="0.6"')}
    ${rect(118, 41.6, 6.5, 0.6, gray(1))}
    <rect x="22" y="35.6" width="8" height="5.5" fill="none" stroke="${C.outline}" stroke-width="${STEP * 1.5}" rx="1"/>
  `;
  return svg(`
    <defs>${defs}</defs>
    <g clip-path="url(#body)">
      ${side}${streak}${shoulder}${haunch}${hoodEdge}${ends}${flare(REAR_X)}${flare(FRONT_X)}${seams}
    </g>
  `);
}

function layerPaintMask() {
  return svg(`<rect width="${W}" height="${H}" fill="#fff"/>${nonPaint('#000')}`);
}

function layerHeadlight() {
  return svg(`
    <path d="${HEADLIGHT_LENS}" fill="${gray(0.72)}"/>
    <path d="M 264.6 50.6 L 268.4 51 Q 270.2 51.8 270.6 53 L 265 53.4 Z" fill="${gray(0.92)}"/>
    ${rect(261, 50, 3.2, 0.7, gray(1))}
    ${rect(265.4, 51.2, 2.4, 0.7, gray(1))}
    <path d="${HEADLIGHT_LENS}" fill="none" stroke="${C.trimLo}" stroke-width="${STEP}"/>
  `);
}

function layerDirt() {
  const r = rng(7);
  const browns = ['#5b4a37', '#6e5a42', '#7d6a50', '#4a3d2e', '#3d3226'];
  let dots = '';
  for (let i = 0; i < 2600; i++) {
    const x = r() * W;
    const y = 48 + Math.pow(r(), 0.5) * (SILL - 48);
    if (r() < ((y - 48) / (SILL - 48)) ** 1.4) {
      dots += rect(
        x.toFixed(2),
        y.toFixed(2),
        r() < 0.3 ? STEP * 2 : STEP,
        STEP,
        browns[Math.floor(r() * 5)],
      );
    }
  }
  for (const cx of [REAR_X, FRONT_X]) {
    for (let i = 0; i < 260; i++) {
      const a = Math.PI + r() * Math.PI;
      const d = ARCH_R + 1.5 + Math.pow(r(), 2) * 9;
      dots += rect(
        (cx + Math.cos(a) * d).toFixed(2),
        (WHEEL_Y + Math.sin(a) * d).toFixed(2),
        STEP,
        STEP,
        browns[Math.floor(r() * 5)],
      );
    }
  }
  let dust = '';
  for (let i = 0; i < 420; i++) {
    dust += rect(
      (82 + r() * 108).toFixed(2),
      (14 + r() * 23).toFixed(2),
      (STEP * (1 + Math.floor(r() * 4))).toFixed(3),
      STEP,
      r() < 0.5 ? '#8d8a80' : '#a39f94',
    );
  }
  let streaks = '';
  for (let i = 0; i < 18; i++) {
    streaks += rect(
      (14 + r() * 260).toFixed(2),
      (44 + r() * 6).toFixed(2),
      STEP,
      (3 + r() * 10).toFixed(2),
      '#6e5a42',
    );
  }
  return svg(`
    <defs>${defs}</defs>
    <g clip-path="url(#body)">${dots}${streaks}</g>
    <g clip-path="url(#glass)">${dust}</g>
  `);
}

function layerOverlay(kind) {
  if (kind === 'rust') {
    const r = rng(21);
    const rust = ['#7a3a1c', '#93481f', '#b25b26', '#5c2c16', '#c56a2c'];
    const zones = [
      [REAR_X - 28, SILL - 14, 16, 12],
      [REAR_X + 16, SILL - 12, 14, 10],
      [FRONT_X - 30, SILL - 12, 14, 10],
      [FRONT_X + 18, SILL - 14, 14, 12],
      [90, SKIRT - 4, 70, 6],
      [8, 46, 10, 18],
      [238, 44, 14, 5],
    ];
    let spots = '';
    for (const [zx, zy, zw, zh] of zones) {
      for (let i = 0; i < zw * zh * 2.4; i++) {
        const x = zx + r() * zw;
        const y = zy + r() * zh;
        const k = 1 - Math.hypot((x - zx - zw / 2) / (zw / 2), (y - zy - zh / 2) / (zh / 2));
        if (r() < k)
          spots += rect(
            x.toFixed(2),
            y.toFixed(2),
            r() < 0.4 ? STEP * 2 : STEP,
            STEP,
            rust[Math.floor(r() * 5)],
          );
      }
    }
    return svg(`<defs>${defs}</defs><g clip-path="url(#body)">${spots}</g>`);
  }
  if (kind === 'cage') {
    return svg(`
      <defs>${defs}</defs>
      <g clip-path="url(#glass)">
        <path d="M 98 37 L 128 15 L 130.5 15 L 100.5 37 Z" fill="${C.metal}"/>
        <path d="M 98.6 37 L 128.6 15 L 129.3 15 L 99.3 37 Z" fill="${C.metalHi}"/>
        ${rect(84, 22, 110, 1.6, C.metal)}
        ${rect(84, 22, 110, 0.5, C.metalHi)}
        ${rect(146, 15, 1.6, 22, C.metal)}
      </g>
      <g clip-path="url(#body)">
        ${rect(83, SKIRT, 125, SILL - SKIRT, C.metalDark)}
        ${rect(83, SKIRT, 125, 0.6, C.metal)}
      </g>
      ${rect(276.5, 64, 2.4, 3.6, '#d14b2a')}
    `);
  }
  if (kind === 'light') {
    let weave = '';
    for (let y = 38; y < 54; y += STEP * 2) {
      for (let x = 195; x < 272; x += STEP * 2) {
        const odd = (Math.round(x * 1.5) + Math.round(y * 1.5)) % 2;
        weave += rect(x.toFixed(2), y.toFixed(2), STEP * 2, STEP * 2, odd ? '#24252a' : '#34363c');
      }
    }
    return svg(`
      <defs>${defs}
        <clipPath id="hood"><path d="M 195 38.6 L 230 42.5 L 256 46.6 L 257 48 L 230 45.6 L 195 41.6 Z"/></clipPath>
      </defs>
      <g clip-path="url(#hood)">${weave}</g>
      <path d="${QUARTER_GLASS}" fill="#0b1018"/>
    `);
  }
  throw new Error(kind);
}

function layerSpoiler(kind, part) {
  if (kind === 'lip') {
    const lip = 'M 9.5 32.8 L 40 31.2 L 46.5 26.5 Q 46 25.7 44 25.9 L 12 28.9 Q 9 29.7 9.5 32.8 Z';
    return part === 'paint'
      ? svg(
          `<path d="${lip}" fill="${gray(0.82)}"/><path d="M 12 28.9 L 44 25.9 Q 46 25.7 46.5 26.5 L 45.6 27.2 Q 44 26.8 12 29.9 Z" fill="${gray(1)}"/><path d="M 40 31.2 L 46.5 26.5 L 46.6 27.7 L 40.6 31.9 Z" fill="${gray(0.5)}"/><path d="${lip}" fill="none" stroke="${C.outline}" stroke-width="${STEP * 2}"/>`,
        )
      : svg('');
  }
  if (part === 'base') {
    // Тень под крылом на крышке багажника.
    return svg(
      `<path d="M 8 32.6 L 44 31.4 L 44 32 L 8 33.2 Z" fill="${C.outline}" opacity="0.5"/>`,
    );
  }
  const blade = 'M 5 23.4 Q 24 21.8 43.6 22 Q 45.6 22.4 45.2 24.4 L 44.8 25.8 Q 25 25.4 6 27 Z';
  const pylons =
    'M 15 32.6 L 21.2 32.4 L 22.6 26 L 17.4 26.2 Z M 32.6 31.8 L 38.8 31.6 L 39 25.6 L 34 25.8 Z';
  return svg(`
    <path d="${pylons}" fill="${gray(0.74)}"/>
    <path d="M 15 32.6 L 16.4 32.6 L 18.6 26.2 L 17.4 26.2 Z M 32.6 31.8 L 34 31.8 L 35.2 25.8 L 34 25.8 Z" fill="${gray(0.92)}"/>
    <path d="${pylons}" fill="none" stroke="${C.outline}" stroke-width="${STEP * 2}"/>
    <path d="${blade}" fill="${gray(0.86)}"/>
    <path d="M 5.4 23.5 Q 24 22 43.6 22.2 L 43.6 23 Q 24 22.9 5.6 24.4 Z" fill="${gray(1)}"/>
    <path d="M 6 26 Q 25 24.6 45 24.9 L 44.8 25.8 Q 25 25.4 6 27 Z" fill="${gray(0.62)}"/>
    <path d="${blade}" fill="none" stroke="${C.outline}" stroke-width="${STEP * 2}"/>
    <rect x="4" y="21.6" width="2.4" height="6.4" rx="0.6" fill="${gray(0.78)}" stroke="${C.outline}" stroke-width="${STEP * 2}"/>
  `);
}

function brickRow(x, y, w, offset = false) {
  const bw = 9;
  let s =
    rect(x, y, w, 8, C.brick) + rect(x, y, w, 1, C.brickHi) + rect(x, y + 7.4, w, 0.6, C.brickDark);
  for (let bx = x + (offset ? bw / 2 : bw); bx < x + w; bx += bw)
    s += rect(bx, y, 0.8, 8, C.mortar);
  s += rect(x, y + 7.2, w, 0.8, C.mortar);
  return (
    s +
    `<rect x="${x}" y="${y}" width="${w}" height="8" fill="none" stroke="${C.brickDark}" stroke-width="${STEP * 2}"/>`
  );
}

function layerBricks() {
  const cx = FRONT_X;
  const cy = WHEEL_Y;
  let holes = '';
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    holes += `<circle cx="${(cx + Math.cos(a) * 9.5).toFixed(2)}" cy="${(cy + Math.sin(a) * 9.5).toFixed(2)}" r="0.6" fill="${C.discDark}"/>`;
  }
  let studs = '';
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5;
    studs += `<circle cx="${(cx + Math.cos(a) * 2.8).toFixed(2)}" cy="${(cy + Math.sin(a) * 2.8).toFixed(2)}" r="0.6" fill="${C.metalHi}"/>`;
  }
  return svg(`
    <circle cx="${cx}" cy="${cy}" r="13" fill="${C.discDark}"/>
    <circle cx="${cx}" cy="${cy}" r="12.2" fill="${C.disc}"/>
    ${holes}
    <circle cx="${cx}" cy="${cy}" r="6" fill="${C.metalDark}"/>
    <circle cx="${cx}" cy="${cy}" r="4.2" fill="${C.metal}"/>
    ${studs}
    <path d="M ${cx - 16} ${cy - 8} Q ${cx - 18} ${cy} ${cx - 15} ${cy + 6} L ${cx - 10} ${cy + 4} Q ${cx - 12} ${cy} ${cx - 10} ${cy - 6} Z" fill="${C.caliperGrey}"/>
    ${brickRow(cx - 14, GROUND - 16, 28)}
    ${brickRow(cx - 14, GROUND - 8, 28, true)}
  `);
}

// ---------- Колёса: шина + тормоз (не перекрашиваются) и диск (серый) ----------

const TIRES = {
  stock: { rim: 12.8, style: 'twin5', caliper: C.caliperGrey },
  studded: { rim: 11.8, style: 'steel', caliper: C.caliperGrey, studs: true },
  slicks: { rim: 13.6, style: 'six', caliper: C.caliperRed },
  old: { rim: 11.8, style: 'steelOld', caliper: C.caliperGrey, flat: true },
};

const polar = (c, r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [c + Math.cos(a) * r, c + Math.sin(a) * r];
};

function tireSvg(t, angle) {
  const c = FRAME / 2;
  const R = WHEEL_R;
  let marks = '';
  for (let i = 0; i < 6; i++) {
    const [x, y] = polar(c, (R + t.rim) / 2 + 0.6, angle + i * 60);
    marks += `<rect x="${(x - 1.4).toFixed(2)}" y="${(y - 0.35).toFixed(2)}" width="2.8" height="0.7" fill="${C.rubberHi}" transform="rotate(${angle + i * 60 + 90} ${x.toFixed(2)} ${y.toFixed(2)})"/>`;
  }
  let studs = '';
  if (t.studs) {
    for (let i = 0; i < 28; i++) {
      const [x, y] = polar(c, R - 0.8, angle + (i * 360) / 28);
      studs += rect((x - 0.35).toFixed(2), (y - 0.35).toFixed(2), 0.7, 0.7, '#cfd4dc');
    }
  }
  let holes = '';
  for (let i = 0; i < 12; i++) {
    const [x, y] = polar(c, t.rim - 3.2, angle + i * 30);
    holes += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="0.45" fill="${C.discDark}"/>`;
  }
  const hi = t.caliper === C.caliperRed ? C.caliperRedHi : C.metal;
  // Суппорт неподвижен: сзади сверху от оси (машина едет вправо).
  const caliper = `<g transform="rotate(205 ${c} ${c})"><rect x="${c + t.rim - 6.4}" y="${c - 4.2}" width="4.4" height="8.4" rx="1.2" fill="${t.caliper}"/><rect x="${c + t.rim - 6.4}" y="${c - 4.2}" width="1.2" height="8.4" rx="0.6" fill="${hi}"/></g>`;
  const flat = t.flat
    ? `<path d="M ${c - R + 3} ${c + R - 2.4} Q ${c} ${c + R + 1.4} ${c + R - 3} ${c + R - 2.4} L ${c + R - 1} ${c + R - 0.6} Q ${c} ${c + R + 1.8} ${c - R + 1} ${c + R - 0.6} Z" fill="${C.rubber}"/>`
    : '';
  return svg(
    `
    <circle cx="${c}" cy="${c}" r="${R}" fill="${C.outline}"/>
    <circle cx="${c}" cy="${c}" r="${R - 0.6}" fill="${C.rubber}"/>
    <circle cx="${c}" cy="${c}" r="${R - 1.6}" fill="${C.rubberSide}"/>
    <circle cx="${c}" cy="${c}" r="${t.rim + 1.4}" fill="${C.rubber}"/>
    ${flat}${marks}${studs}
    <circle cx="${c}" cy="${c}" r="${t.rim + 0.3}" fill="${C.outline}"/>
    <circle cx="${c}" cy="${c}" r="${t.rim - 1.2}" fill="${C.disc}"/>
    <circle cx="${c}" cy="${c}" r="${t.rim - 1.2}" fill="none" stroke="${C.discHi}" stroke-width="0.5"/>
    ${holes}
    <circle cx="${c}" cy="${c}" r="${t.rim - 5.5}" fill="${C.discDark}"/>
    ${caliper}
  `,
    { w: FRAME, h: FRAME },
  );
}

function rimSvg(t, angle) {
  const c = FRAME / 2;
  const R = t.rim;
  const lip = `
    <circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="${gray(0.75)}" stroke-width="1.6"/>
    <circle cx="${c}" cy="${c}" r="${R + 0.3}" fill="none" stroke="${gray(1)}" stroke-width="0.5"/>
    <path d="M ${(c - R + 1.4).toFixed(2)} ${(c - 3).toFixed(2)} A ${R - 1.4} ${R - 1.4} 0 0 1 ${(c - 3).toFixed(2)} ${(c - R + 1.4).toFixed(2)}" fill="none" stroke="${gray(1)}" stroke-width="0.5"/>
  `;
  const nuts = (n, r) =>
    Array.from({ length: n }, (_, i) => {
      const [x, y] = polar(c, r, angle + (i * 360) / n + 36);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="0.65" fill="${gray(0.45)}"/><circle cx="${(x - 0.2).toFixed(2)}" cy="${(y - 0.2).toFixed(2)}" r="0.3" fill="${gray(1)}"/>`;
    }).join('');
  let face = '';
  if (t.style === 'six') {
    for (let i = 0; i < 6; i++) {
      face += `<g transform="rotate(${angle + i * 60} ${c} ${c})">
        <path d="M ${c - 1.6} ${c - 3.4} L ${c + 1.6} ${c - 3.4} L ${c + 3.4} ${c - R + 1.2} L ${c - 3.4} ${c - R + 1.2} Z" fill="${gray(0.86)}"/>
        <path d="M ${c - 1.6} ${c - 3.4} L ${c - 0.4} ${c - 3.4} L ${c - 1.4} ${c - R + 1.2} L ${c - 3.4} ${c - R + 1.2} Z" fill="${gray(1)}"/>
        <path d="M ${c + 1} ${c - 3.4} L ${c + 1.6} ${c - 3.4} L ${c + 3.4} ${c - R + 1.2} L ${c + 2.4} ${c - R + 1.2} Z" fill="${gray(0.6)}"/>
      </g>`;
    }
    face += `<circle cx="${c}" cy="${c}" r="4.6" fill="${gray(0.8)}"/><circle cx="${c}" cy="${c}" r="2" fill="${gray(0.55)}"/>${nuts(6, 3.4)}`;
  } else if (t.style === 'twin5') {
    for (let i = 0; i < 5; i++) {
      for (const off of [-5.5, 5.5]) {
        face += `<g transform="rotate(${angle + i * 72 + off} ${c} ${c})">
          <path d="M ${c - 0.9} ${c - 4} L ${c + 0.9} ${c - 4} L ${c + 1.3} ${c - R + 1.2} L ${c - 1.3} ${c - R + 1.2} Z" fill="${gray(0.9)}"/>
          <path d="M ${c - 0.9} ${c - 4} L ${c - 0.2} ${c - 4} L ${c - 0.5} ${c - R + 1.2} L ${c - 1.3} ${c - R + 1.2} Z" fill="${gray(1)}"/>
        </g>`;
      }
    }
    face += `<circle cx="${c}" cy="${c}" r="5" fill="${gray(0.82)}"/><circle cx="${c}" cy="${c}" r="2.2" fill="${gray(0.6)}"/>${nuts(5, 3.6)}`;
  } else {
    const base = t.style === 'steelOld' ? 0.62 : 0.8;
    face += `<circle cx="${c}" cy="${c}" r="${R - 0.8}" fill="${gray(base)}"/>`;
    for (let i = 0; i < 8; i++) {
      const [x, y] = polar(c, R * 0.62, angle + i * 45);
      face += `<ellipse cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" rx="1.9" ry="1.2" transform="rotate(${angle + i * 45 + 90} ${x.toFixed(2)} ${y.toFixed(2)})" fill="${C.discDark}"/>`;
    }
    face += `<circle cx="${c}" cy="${c}" r="${R * 0.45}" fill="none" stroke="${gray(base + 0.15)}" stroke-width="0.6"/>
      <circle cx="${c}" cy="${c}" r="3.6" fill="${gray(base - 0.15)}"/>${nuts(5, 2.6)}`;
  }
  return svg(`${face}${lip}`, { w: FRAME, h: FRAME });
}

// ---------- Растеризация ----------

const render = (text) => sharp(Buffer.from(text), { density: 72 }).png().toBuffer();

async function applyMask(png, maskSvg) {
  const mask = await sharp(Buffer.from(maskSvg), { density: 72 }).greyscale().raw().toBuffer();
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < info.width * info.height; i++) if (mask[i] < 128) data[i * 4 + 3] = 0;
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

/** Жёсткая альфа: без полупрозрачных краёв, чтобы точки оставались чёткими. */
async function hardAlpha(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] < 110 ? 0 : 255;
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

async function strip(makeSvg) {
  const size = FRAME * DENSITY;
  const frames = [];
  for (let i = 0; i < FRAMES; i++) frames.push(await render(makeSvg((i * 360) / FRAMES)));
  return sharp({
    create: {
      width: size * FRAMES,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(frames.map((input, i) => ({ input, left: i * size, top: 0 })))
    .png()
    .toBuffer();
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const files = {};
  const save = async (name, buf) => {
    const out = await hardAlpha(buf);
    writeFileSync(`${OUT}${name}.png`, out);
    files[name] = out;
  };

  await save('car_wells', await render(layerWells()));
  await save('car_base', await render(layerBase()));
  await save('car_paint', await applyMask(await render(layerPaint()), layerPaintMask()));
  await save('car_headlight', await render(layerHeadlight()));
  await save('car_dirt', await render(layerDirt()));
  for (const k of ['rust', 'cage', 'light'])
    await save(`car_overlay_${k}`, await render(layerOverlay(k)));
  await save('car_spoiler_lip_paint', await render(layerSpoiler('lip', 'paint')));
  await save('car_spoiler_wing_paint', await render(layerSpoiler('wing', 'paint')));
  await save('car_spoiler_wing_base', await render(layerSpoiler('wing', 'base')));
  await save('car_bricks', await render(layerBricks()));
  for (const [id, t] of Object.entries(TIRES)) {
    await save(`wheel_tire_${id}`, await strip((a) => tireSvg(t, a)));
    await save(`wheel_rim_${id}`, await strip((a) => rimSvg(t, a)));
  }

  const meta = {
    $comment:
      'Сгенерировано tools/build-car.mjs (npm run car) — не править руками. Координаты в единицах мира; текстуры в density раз детальнее.',
    density: DENSITY,
    size: { width: W, height: H },
    anchor: { x: W / 2, y: GROUND },
    wheels: { rear: { x: REAR_X, y: WHEEL_Y }, front: { x: FRONT_X, y: WHEEL_Y }, radius: WHEEL_R },
    wheelFrame: { width: FRAME, height: FRAME, frames: FRAMES },
    headlight: { x: 272, y: 52 },
    tires: {
      wheels_stock: 'stock',
      wheels_studded: 'studded',
      wheels_slicks: 'slicks',
      none: 'old',
    },
    overlays: { body_rusty: 'rust', body_cage: 'cage', body_light: 'light' },
    spoilers: {
      spoiler_lip: { paint: 'car_spoiler_lip_paint' },
      spoiler_wing: { paint: 'car_spoiler_wing_paint', base: 'car_spoiler_wing_base' },
    },
  };
  writeFileSync(`${ROOT}data/car.json`, JSON.stringify(meta, null, 2) + '\n');
  console.log(`✓ ${Object.keys(files).length} файлов в public/assets/images/car, data/car.json`);
  if (PREVIEW) await preview(files);
}

async function preview(files) {
  const D = DENSITY;
  const tint = async (buf, hex) => {
    const { data, info } = await sharp(buf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const n = parseInt(hex.slice(1), 16);
    const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    for (let i = 0; i < data.length; i += 4) {
      for (let k = 0; k < 3; k++) data[i + k] = (data[i + k] * rgb[k]) / 255;
    }
    return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toBuffer();
  };
  const F = FRAME * D;
  const frame = (buf, i = 0) =>
    sharp(buf)
      .extract({ left: i * F, top: 0, width: F, height: F })
      .png()
      .toBuffer();
  const wheel = async (type, rimHex, i) => [
    await frame(files[`wheel_tire_${type}`], i),
    await tint(await frame(files[`wheel_rim_${type}`], i), rimHex),
  ];

  const variants = [
    { paint: '#a8adb3', tire: null, overlay: 'rust', dirt: true },
    { paint: '#e8e8e0', tire: 'stock', overlay: null, rim: '#c0c4c8' },
    { paint: '#1f3f8f', tire: 'slicks', overlay: 'light', rim: '#3a3c42', spoiler: 'wing' },
    { paint: '#8b1a2b', tire: 'studded', overlay: 'cage', rim: '#c0c4c8', spoiler: 'lip' },
  ];
  const rows = [];
  for (const [vi, v] of variants.entries()) {
    const layers = [];
    const add = (input, left = 0, top = 0) =>
      layers.push({ input, left: Math.round(left), top: Math.round(top) });
    add(files.car_wells);
    const pos = (x) => [(x - FRAME / 2) * D, (WHEEL_Y - FRAME / 2) * D];
    if (v.tire) {
      for (const x of [REAR_X, FRONT_X])
        for (const b of await wheel(v.tire, v.rim, vi * 3)) add(b, ...pos(x));
    } else {
      for (const b of await wheel('old', '#9a9ea6', 0)) add(b, ...pos(REAR_X));
      add(files.car_bricks);
    }
    if (v.spoiler === 'wing') add(files.car_spoiler_wing_base);
    add(files.car_base);
    add(await tint(files.car_paint, v.paint));
    if (v.overlay) add(files[`car_overlay_${v.overlay}`]);
    if (v.spoiler === 'lip') add(await tint(files.car_spoiler_lip_paint, v.paint));
    if (v.spoiler === 'wing') add(await tint(files.car_spoiler_wing_paint, v.paint));
    add(await tint(files.car_headlight, '#ffe8b0'));
    if (v.dirt) add(files.car_dirt);
    rows.push(
      await sharp({ create: { width: W * D, height: H * D, channels: 4, background: '#2a2724' } })
        .composite(layers)
        .png()
        .toBuffer(),
    );
  }
  mkdirSync(`${ROOT}art/preview`, { recursive: true });
  await sharp({
    create: { width: W * D, height: H * D * rows.length, channels: 4, background: '#2a2724' },
  })
    .composite(rows.map((input, i) => ({ input, left: 0, top: i * H * D })))
    .png()
    .toFile(`${ROOT}art/preview/car.png`);
  console.log('✓ превью art/preview/car.png');
}

await main();
