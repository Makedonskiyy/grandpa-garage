#!/usr/bin/env node
/**
 * build-car — генератор модульной машины игрока («дедова японка»).
 *
 * Пропорции — купе R34 по фотографии масштабной модели строго сбоку: длинный ровный
 * багажник, короткая крутая стойка C, толстая рамка крыши над стёклами, длинный капот.
 * Марок, шильдиков и названий нет (ТЗ 2.1).
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
import { format } from 'prettier';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}public/assets/images/car/`;
const PREVIEW = process.argv.includes('--preview');

const DENSITY = 3; // пикселей текстуры на единицу мира
const W = 288;
const H = 96;
const GROUND = 92;

// ---------- Пропорции ----------
// Сняты с фотографии масштабной модели R34 строго сбоку: длина кузова 272 ед. ≈ 4,6 м,
// база 159 ед. ≈ 2,67 м, колёса 18″ (R 17,9 ед.), крыша на высоте ≈ 1,36 м.
const WHEEL_R = 17.9;
const WHEEL_Y = GROUND - WHEEL_R; // 74.1
const REAR_X = 62.3;
const FRONT_X = 221.4;
const ARCH_R = 20.2;
const SILL = 84; // низ порога
const SKIRT = 80.4; // верх тёмной юбки порога
const FRAME = 48; // кадр колеса, ед.
const FRAMES = 16;
const STEP = 1 / DENSITY; // одна точка текстуры в единицах мира

const C = {
  outline: '#0b0c10',
  well: '#08080b',
  trim: '#16171b',
  trimHi: '#2c2e34',
  trimLo: '#0f1013',
  rubber: '#121316',
  rubberSide: '#2b2c30',
  rubberHi: '#3e4046',
  glassTop: '#3a3d45',
  glassMid: '#1e2026',
  glassLow: '#16171b',
  glassDeep: '#0e0f12',
  glassShine: '#8d96a6',
  tail: '#9e1b26',
  tailHi: '#e0454d',
  tailLo: '#5e0f15',
  marker: '#e08c2c',
  metal: '#7a7e86',
  metalHi: '#b8bcc4',
  metalDark: '#45484f',
  disc: '#5f636a',
  discHi: '#8a8e96',
  discDark: '#3d4045',
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

// Линия крыши R34: длинный ровный багажник, короткая крутая стойка C, ровная крыша,
// лобовое под крутым углом, длинный капот плавно опускается к носу.
const ROOF_LINE = [
  'L 58 27.7', // багажник
  'L 64 24.4', // стойка C
  'L 72 19.8',
  'L 80 16',
  'L 88 13.4',
  'Q 94 11.6 99 11.4',
  'L 141 11.4', // крыша
  'Q 145 11.6 148 13.6',
  'L 155.6 16.8', // лобовое
  'L 164 22.4',
  'L 172.4 27.2',
  'L 180.9 31.9',
  'Q 185.5 33.2 190 33.4',
  'L 206.2 36.1', // капот
  'L 218.8 37.7',
  'L 231.4 39.8',
  'L 244.1 41.9',
  'L 256.7 45.6',
].join(' ');

const BODY_PATH = [
  'M 20 83.4',
  'Q 12 83 9.6 79', // низ заднего бампера
  'L 8.6 70',
  'L 8 56',
  'Q 8 54.6 9.4 54', // ступенька над бампером
  'L 11 52.6',
  'L 12 40',
  'Q 12.4 34.6 15.4 33.4', // задний торец крышки багажника
  'Q 18 30 22 28.6',
  ROOF_LINE,
  'Q 263 47.6 266.8 50.6', // нос
  'Q 270 53.4 271.2 57.6',
  'L 271.8 62', // передний бампер сразу перед фарами
  'Q 272.8 68 272.4 74',
  'L 271.8 80',
  'L 273.6 83.4', // губа
  'L 271.6 85.2',
  'L 244 85.2',
  `L ${FA.a} ${SILL}`,
  `A ${ARCH_R} ${ARCH_R} 0 1 0 ${FA.b} ${SILL}`,
  `L ${RA.a} ${SILL}`,
  `A ${ARCH_R} ${ARCH_R} 0 1 0 ${RA.b} ${SILL}`,
  'L 26 83.6',
  'Z',
].join(' ');

// Остекление: заднее стекло видно тонкой тёмной полосой над стойкой C; форточка с почти
// вертикальным задним краем; чёрная стойка B; дверное стекло до стойки A; лобовое — клин.
// Над стёклами толстая рамка крыши, как у настоящего R34.
const REAR_GLASS =
  'M 58 27.7 L 64 24.4 L 72 19.8 L 80 16 L 88 13.4 Q 94 11.6 99 11.4 L 99 12.8 Q 94.4 13 88.6 14.8 L 80.6 17.4 L 72.6 21.2 L 64.6 25.8 L 60.4 27.7 Z';
const QUARTER_GLASS =
  'M 84 18.6 Q 88 17.2 96 17.2 L 111.4 17.2 L 111.4 37.4 L 96 36 L 82.6 34.8 Q 80.6 34.2 80.8 31.6 L 81.4 21.6 Q 82 19 84 18.6 Z';
const B_PILLAR = 'M 111.4 17.2 L 115.8 17.2 L 115.8 37.8 L 111.4 37.4 Z';
const DOOR_GLASS =
  'M 115.8 17.2 L 150 17.2 Q 152 17.3 153.5 18.2 L 172.4 33.5 Q 175.6 37 175 39.4 L 115.8 38.2 Z';
const WINDSHIELD =
  'M 145.6 12 Q 147.6 12.4 149.4 13.8 L 155.6 16.8 L 164 22.4 L 172.4 27.2 L 180.9 31.9 Q 184.6 33 188 33.4 L 177.4 33.6 L 157.6 17.6 Q 152.4 13.2 145.6 12 Z';
const MIRROR =
  'M 166.4 33.4 Q 166.8 32 168.4 32 L 175 32.2 Q 177 32.6 176.8 34.8 L 176.2 38.4 Q 175.8 39.4 174.4 39.4 L 168.4 39.4 Q 166.4 39.4 166.4 37.8 Z';
const HEADLIGHT =
  'M 251 50 L 262.8 50.6 Q 266.8 51.6 268.4 54.4 L 267.6 57.6 L 254.2 57.8 Q 251.8 54.4 251 50 Z';
const LAMPS = [
  [257.4, 54],
  [263.2, 54],
];
const TAIL = { x: 11.6, y: 38.8, w: 6, h: 8.8 };
const INTAKE = 'M 261.6 63 L 272 63 L 272.2 74 L 263.4 74.6 Q 261.8 69 261.6 63 Z';
const HOOD =
  'M 190 33.4 L 206.2 36.1 L 218.8 37.7 L 231.4 39.8 L 244.1 41.9 L 256.7 45.6 L 257.4 47.6 L 230 42.2 L 190 36 Z';

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
    <path d="${REAR_GLASS}" fill="${f(C.glassDeep)}"/>
    <path d="${WINDSHIELD}" fill="${f(C.glassLow)}"/>
    <path d="${QUARTER_GLASS}" fill="${f(C.glassMid)}"/>
    <path d="${DOOR_GLASS}" fill="${f(C.glassMid)}"/>
    <path d="${B_PILLAR}" fill="${f(C.trim)}"/>
    <path d="${HEADLIGHT}" fill="${f(C.trim)}"/>
    <path d="${INTAKE}" fill="${f(C.trimLo)}"/>
    ${rect(TAIL.x, TAIL.y, TAIL.w, TAIL.h, f(C.tail), 'rx="2.6"')}
    <path d="M 9.6 74 Q 11 80.4 18 82.6 L 40 83 L 40.6 84.4 L 20 84.2 Q 12 83.6 9.8 79 Z" fill="${f(C.trim)}"/>
    <path d="M 240 82.8 L 271.8 82.8 L 273.6 83.6 L 271.6 85.2 L 242 85.2 Z" fill="${f(C.trim)}"/>
    ${rect(80, 83, 124.4, 1.6, f(C.trimLo))}
    ${rect(170, 39.4, 3, 1.6, f(C.trim))}
  `;
}

function layerBase() {
  // Тёмное стекло: светлее у рамки крыши, к салону темнее, слабый диагональный блик.
  const glassColors = [C.glassDeep, C.glassLow, C.glassMid, '#282a30', C.glassTop];
  const glass = stepGradient(
    [
      [17.2, 0.9],
      [21, 0.6],
      [30, 0.35],
      [39.6, 0.1],
    ],
    17.2,
    39.6,
    78,
    180,
    4,
    (v) => glassColors[Math.round(v * 4)],
  );
  let mesh = '';
  for (let y = 64.4; y < 74; y += 1.8) mesh += rect(263.4, y, 8.6, 0.6, C.trimHi);
  const lamps = LAMPS.map(
    ([x, y]) =>
      `<circle cx="${x}" cy="${y}" r="2.5" fill="${C.trimLo}"/><circle cx="${x}" cy="${y}" r="2.5" fill="none" stroke="${C.trimHi}" stroke-width="${STEP}"/>`,
  ).join('');
  return svg(`
    <defs>${defs}</defs>
    <path d="${BODY_PATH}" fill="${C.outline}"/>
    <g clip-path="url(#body)">
      ${nonPaint()}
      <g clip-path="url(#glass)">
        ${glass}
        <path d="M 128 17.2 L 135 17.2 L 123 38.2 L 116 38.2 Z" fill="${C.glassShine}" opacity="0.16"/>
        <path d="M 138 17.2 L 140.4 17.2 L 128.4 38.2 L 126 38.2 Z" fill="${C.glassShine}" opacity="0.12"/>
        <!-- подголовник в салоне -->
        <path d="M 122 38.2 L 123 27 Q 124 23.8 127 23.8 L 129 23.8 Q 131 23.8 130.6 27 L 129.4 38.2 Z" fill="${C.glassDeep}"/>
      </g>
      ${lamps}
      <!-- задний фонарь: круглая линза, блик сверху -->
      ${rect(TAIL.x + 0.8, TAIL.y + 0.8, TAIL.w - 1.6, 2.4, C.tailHi, 'rx="1"')}
      ${rect(TAIL.x + 0.6, TAIL.y + TAIL.h - 2.4, TAIL.w - 1.2, 1.8, C.tailLo, 'rx="0.8"')}
      <!-- решётка воздухозаборника, губа, диффузор -->
      ${mesh}
      ${rect(244, 83.2, 27, 0.7, C.trimHi)}
      ${rect(16, 82, 24, 0.7, C.trimHi)}
    </g>
    <path d="${BODY_PATH}" fill="none" stroke="${C.outline}" stroke-width="${STEP * 3}"/>
    <path d="${QUARTER_GLASS}" fill="none" stroke="${C.outline}" stroke-width="${STEP * 2}"/>
    <path d="${DOOR_GLASS}" fill="none" stroke="${C.outline}" stroke-width="${STEP * 2}"/>
  `);
}

/**
 * Краска: свет неба сверху, светлое плечо под линией окон, борт плавно темнеет книзу
 * ступенями, на двери — нижнее ребро (тень и блик), юбка порога темнее. Над задней аркой
 * мощное «бедро» с бликом, переднее крыло над аркой тоже ловит свет. Торцы темнее борта.
 */
function layerPaint() {
  const side = stepGradient(
    [
      [11.4, 0.9],
      [13, 0.97],
      [34, 0.95],
      [37.4, 0.95],
      [38.2, 1],
      [40.6, 1],
      [41.4, 0.95],
      [50, 0.9],
      [62, 0.84],
      [73.6, 0.78],
      [74.2, 0.58],
      [74.8, 0.58],
      [75.4, 0.95],
      [76.4, 0.84],
      [78, 0.76],
      [SKIRT, 0.7],
      [SKIRT + 0.6, 0.9],
      [SKIRT + 1.4, 0.62],
      [SILL, 0.5],
    ],
    11.4,
    SILL + 1.4,
    0,
    W,
    16,
  );
  const hood = `<path d="${HOOD}" fill="${gray(1)}"/>`;
  // «Бедро» над задней аркой и плечо над передней — дуги блика и тени.
  const haunch = `
    <path d="M 26 46 Q 62 39.6 104 43.2 L 104 44.2 Q 62 40.8 26 47.2 Z" fill="${gray(1)}"/>
    <path d="M 26 47.2 Q 62 40.8 104 44.2 L 104 46 Q 62 42.8 26 49 Z" fill="${gray(0.8)}"/>
    <path d="M 196 47.6 Q 222 43.6 250 47.4 L 250 48.4 Q 222 44.8 196 48.6 Z" fill="${gray(1)}"/>
  `;
  const ends = `
    <rect x="0" y="28" width="11" height="58" fill="${gray(0.66)}"/>
    <rect x="11" y="28" width="2" height="58" fill="${gray(0.78)}"/>
    <rect x="268.6" y="56" width="20" height="32" fill="${gray(0.7)}"/>
  `;
  const flare = (cx) =>
    `<circle cx="${cx}" cy="${WHEEL_Y}" r="${ARCH_R + 0.8}" fill="none" stroke="${gray(0.62)}" stroke-width="0.9"/>`;
  const seams = `
    <path d="M 106.6 37.2 L 106.6 82.6" fill="none" stroke="${C.outline}" stroke-width="${STEP * 1.5}"/>
    <path d="M 187.4 40 Q 188.6 60 186.8 82.6" fill="none" stroke="${C.outline}" stroke-width="${STEP * 1.5}"/>
    <path d="M 190 33.6 Q 230 40 262 49" fill="none" stroke="${gray(0.7)}" stroke-width="${STEP * 1.5}"/>
    <rect x="39.6" y="40.4" width="10" height="9" rx="1.2" fill="none" stroke="${C.outline}" stroke-width="${STEP * 1.5}"/>
    ${rect(40.2, 41, 8.8, 0.6, gray(1))}
    ${rect(115, 43.8, 8.6, 1.8, C.outline, 'rx="0.6"')}
    ${rect(115.4, 44, 7.8, 0.7, gray(1))}
    ${rect(115.4, 44.7, 7.8, 0.6, gray(0.72))}
  `;
  const mirror = `
    <path d="${MIRROR}" fill="${gray(0.9)}"/>
    <path d="M 167.8 33 L 175 33.2 L 174.8 34.4 L 167.8 34.2 Z" fill="${gray(1)}"/>
    ${rect(167.4, 37.8, 9, 1.4, gray(0.68))}
    <path d="${MIRROR}" fill="none" stroke="${C.outline}" stroke-width="${STEP * 2}"/>
  `;
  return svg(`
    <defs>${defs}</defs>
    <g clip-path="url(#body)">
      ${side}${hood}${haunch}${ends}${flare(REAR_X)}${flare(FRONT_X)}${seams}
    </g>
    ${mirror}
  `);
}

function layerPaintMask() {
  return svg(
    `<rect width="${W}" height="${H}" fill="#fff"/>${nonPaint('#000')}<path d="${MIRROR}" fill="#fff"/>`,
  );
}

function layerHeadlight() {
  return svg(
    LAMPS.map(
      ([x, y]) => `
      <circle cx="${x}" cy="${y}" r="1.9" fill="${gray(0.74)}"/>
      <circle cx="${x}" cy="${y}" r="1.1" fill="${gray(0.92)}"/>
      ${rect(x - 1.1, y - 1.3, 1, 0.8, gray(1))}
    `,
    ).join(''),
  );
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
      (82 + r() * 100).toFixed(2),
      (12.4 + r() * 24).toFixed(2),
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
        <path d="M 100 37 L 128 12 L 130.5 12 L 102.5 37 Z" fill="${C.metal}"/>
        <path d="M 100.6 37 L 128.6 12 L 129.3 12 L 101.3 37 Z" fill="${C.metalHi}"/>
        ${rect(80, 20, 106, 1.6, C.metal)}
        ${rect(80, 20, 106, 0.5, C.metalHi)}
        ${rect(150, 12, 1.6, 26, C.metal)}
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
    for (let y = 32; y < 48; y += STEP * 2) {
      for (let x = 188; x < 260; x += STEP * 2) {
        const odd = (Math.round(x * 1.5) + Math.round(y * 1.5)) % 2;
        weave += rect(x.toFixed(2), y.toFixed(2), STEP * 2, STEP * 2, odd ? '#24252a' : '#34363c');
      }
    }
    return svg(`
      <defs>${defs}
        <clipPath id="hood"><path d="${HOOD}"/></clipPath>
      </defs>
      <g clip-path="url(#hood)">${weave}</g>
      <path d="${QUARTER_GLASS}" fill="#0b1018"/>
    `);
  }
  throw new Error(kind);
}

function layerSpoiler(kind, part) {
  return svg(`<g transform="translate(0 -1.4)">${spoilerBody(kind, part)}</g>`);
}

/** Содержимое спойлера в координатах прежней крышки багажника (y 29,1). */
const frag = (x) => x;

function spoilerBody(kind, part) {
  if (kind === 'lip') {
    // Утиный хвост на крышке багажника.
    const lip = 'M 16.6 30 L 46 28.8 L 51.6 25 Q 51.2 24.2 49.2 24.4 L 19 26.8 Q 16 27.6 16.6 30 Z';
    return part === 'paint'
      ? frag(
          `<path d="${lip}" fill="${gray(0.82)}"/><path d="M 19 26.8 L 49.2 24.4 Q 51.2 24.2 51.6 25 L 50.8 25.6 Q 49 25.3 19 27.8 Z" fill="${gray(1)}"/><path d="M 46 28.8 L 51.6 25 L 51.7 26.2 L 46.6 29.5 Z" fill="${gray(0.5)}"/><path d="${lip}" fill="none" stroke="${C.outline}" stroke-width="${STEP * 2}"/>`,
        )
      : frag('');
  }
  if (part === 'base') {
    // Тень под крылом на крышке багажника.
    return frag(
      `<path d="M 16 29.6 L 49 29.3 L 49 29.9 L 16 30.2 Z" fill="${C.outline}" opacity="0.5"/>`,
    );
  }
  // Антикрыло на высоких стойках, с торцевыми пластинами.
  const blade = 'M 10 18.4 Q 29 16.8 48.6 17 Q 50.6 17.4 50.2 19.4 L 49.8 20.8 Q 30 20.4 11 22 Z';
  const pylons =
    'M 21 29.6 L 27.2 29.4 L 28.6 21 L 23.4 21.2 Z M 37.6 29.3 L 43.8 29.1 L 44 20.6 L 39 20.8 Z';
  return frag(`
    <path d="${pylons}" fill="${gray(0.74)}"/>
    <path d="M 21 29.6 L 22.4 29.6 L 24.6 21.2 L 23.4 21.2 Z M 37.6 29.3 L 39 29.3 L 40.2 20.8 L 39 20.8 Z" fill="${gray(0.92)}"/>
    <path d="${pylons}" fill="none" stroke="${C.outline}" stroke-width="${STEP * 2}"/>
    <path d="${blade}" fill="${gray(0.86)}"/>
    <path d="M 10.4 18.5 Q 29 17 48.6 17.2 L 48.6 18 Q 29 17.9 10.6 19.4 Z" fill="${gray(1)}"/>
    <path d="M 11 21 Q 30 19.6 50 19.9 L 49.8 20.8 Q 30 20.4 11 22 Z" fill="${gray(0.62)}"/>
    <path d="${blade}" fill="none" stroke="${C.outline}" stroke-width="${STEP * 2}"/>
    <rect x="8.6" y="16.4" width="2.4" height="7" rx="0.6" fill="${gray(0.78)}" stroke="${C.outline}" stroke-width="${STEP * 2}"/>
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

// Низкий профиль: диск почти во всё колесо (как на референсе — 18″ на тонкой резине).
const TIRES = {
  stock: { rim: 13.6, style: 'multi', caliper: C.caliperGrey },
  studded: { rim: 12.4, style: 'steel', caliper: C.caliperGrey, studs: true },
  slicks: { rim: 13.8, style: 'six', caliper: C.caliperRed },
  old: { rim: 12.4, style: 'steelOld', caliper: C.caliperGrey, flat: true },
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
  } else if (t.style === 'multi') {
    face += `<circle cx="${c}" cy="${c}" r="${R - 1}" fill="${gray(0.5)}"/>`;
    for (let i = 0; i < 10; i++) {
      for (const off of [-4.2, 4.2]) {
        face += `<g transform="rotate(${angle + i * 36 + off} ${c} ${c})">
          <path d="M ${c - 0.7} ${c - 4.2} L ${c + 0.7} ${c - 4.2} L ${c + 1.3} ${c - R + 1.4} L ${c - 1.3} ${c - R + 1.4} Z" fill="${gray(0.9)}"/>
          <path d="M ${c - 0.7} ${c - 4.2} L ${c - 0.1} ${c - 4.2} L ${c - 0.3} ${c - R + 1.4} L ${c - 1} ${c - R + 1.4} Z" fill="${gray(1)}"/>
        </g>`;
      }
    }
    face += `<circle cx="${c}" cy="${c}" r="${R - 1.2}" fill="none" stroke="${gray(0.96)}" stroke-width="1.4"/>
      <circle cx="${c}" cy="${c}" r="5" fill="${gray(0.86)}"/><circle cx="${c}" cy="${c}" r="2.2" fill="${gray(0.55)}"/>${nuts(5, 3.6)}`;
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
    headlight: { x: 266, y: 54 },
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
  writeFileSync(`${ROOT}data/car.json`, await format(JSON.stringify(meta), { parser: 'json' }));
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
