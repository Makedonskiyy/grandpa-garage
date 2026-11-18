#!/usr/bin/env node
/**
 * build-car — генератор модульной машины игрока («дедова японка»), пиксель-арт.
 *
 * Машина рисуется по точкам на сетке 288×96 (1 точка = 1 единица мира, ≈ 17 мм), как спрайты
 * гоночных пиксельных игр, и сохраняется увеличенной в SCALE раз без сглаживания. Пропорции —
 * купе R34 по чертежу (длина 4600, база 2665, высота 1360 мм). Марок, шильдиков и названий
 * нет (ТЗ 2.1).
 *
 * Как рисуется кузов:
 *   1. Формы (кузов, стёкла, фары, пластик) задаются контурами и растеризуются в маски.
 *   2. Каждая точка кузова получает тон: полосы света сверху вниз, кромки арок, торцы темнее.
 *   3. Поверх — детали точками по чертежу: линии борта, швы дверей с фаской (тёмная линия +
 *      светлая), высокий порог, бампера со швами, ручка двери, зеркало, фары и фонари.
 *   4. Контур: крайние точки кузова и рамки стёкол — почти чёрные.
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

const SCALE = 3; // точка арта = SCALE×SCALE пикселей текстуры
const W = 288;
const H = 96;
const GROUND = 92;

// ---------- Пропорции: чертёж R34 GT-R (длина 4600, база 2665, высота 1360 мм) ----------
// Вид сбоку с чертежа отражён (у нас машина смотрит вправо) и приведён к сетке:
// длина кузова 272 точки от x=8, земля y=92, 1 точка ≈ 16,9 мм. Все точки ниже сняты с него.
const WHEEL_R = 19.6;
const WHEEL_Y = GROUND - WHEEL_R; // 72.4
const REAR_X = 66.4;
const FRONT_X = 224.6;
const ARCH_R = 22;
const SILL = 83.4; // низ кузова между колёсами
const FRAME = 48; // кадр колеса
const FRAMES = 16;

const arch = (cx) => {
  const dx = Math.sqrt(ARCH_R ** 2 - (SILL - WHEEL_Y) ** 2);
  return { a: (cx + dx).toFixed(2), b: (cx - dx).toFixed(2) };
};
const FA = arch(FRONT_X);
const RA = arch(REAR_X);

const BODY_PATH = [
  'M 34 83.2',
  'Q 16 82.6 12.4 76', // низ заднего бампера скруглён
  'Q 9.4 71 8.8 64',
  'L 8.4 57',
  'Q 8.6 50 10.6 46', // торец кормы наклонён вперёд
  'L 12.2 42',
  'Q 13 34 17.6 32', // край крышки багажника
  'L 48 31.8', // багажник
  'L 52 30.3', // стойка C — длинный пологий скат
  'L 56 28.8',
  'L 60 27.3',
  'L 64 25.9',
  'L 68 23.9',
  'L 76 21.2',
  'L 84 18.4',
  'L 88 16.9',
  'Q 92 14.9 98 13.6',
  'Q 104 12.4 112 11.7',
  'L 132 11.7', // крыша
  'Q 140 11.9 148 13.2',
  'L 156 14.4', // лобовое
  'L 160 15.5',
  'L 164 17.7',
  'L 168 19.9',
  'L 172 22.1',
  'L 176 23.6',
  'L 180 25.9',
  'L 184 28.1',
  'L 188 30.3',
  'L 192 33.2',
  'Q 195 35.3 199 36.2',
  'L 212 36.4', // капот
  'L 224 37.7',
  'L 236 40',
  'L 248 42.2',
  'L 260 44.4',
  'L 264 45.3',
  'Q 270 47.6 273.6 50', // нос
  'Q 277 53 278.4 57',
  'L 279.6 62', // передний бампер
  'Q 280.2 68 279.8 74',
  'L 279 80',
  'L 280.2 83.4', // губа
  'L 278.4 85.3',
  'L 246 85.3',
  `L ${FA.a} ${SILL}`,
  `A ${ARCH_R} ${ARCH_R} 0 1 0 ${FA.b} ${SILL}`,
  `L ${RA.a} ${SILL}`,
  `A ${ARCH_R} ${ARCH_R} 0 1 0 ${RA.b} ${SILL}`,
  'L 36 83.2',
  'Z',
].join(' ');

// Остекление: заднее стекло — тёмная полоса вдоль стойки C; форточка треугольником
// с острым задним углом; чёрная стойка B; дверное стекло до стойки A; лобовое — клин.
const REAR_GLASS =
  'M 48 31.8 L 56 28.8 L 64 25.9 L 76 21.2 L 88 16.9 Q 92 14.9 98 13.6 Q 104 12.4 112 11.7 L 112 13.4 Q 104 14 98.4 15.2 Q 92.6 16.4 88.6 18.4 L 76.6 22.8 L 64.6 27.6 L 56.6 30.6 L 52 31.8 Z';
const QUARTER_GLASS =
  'M 85.4 36.4 L 86.4 32.4 L 103.6 20.2 Q 106.6 18.6 110.6 18.6 L 116 18.6 L 116 38.2 Z';
const B_PILLAR = 'M 116 18.6 L 121 18.6 L 121 38.4 L 116 38.2 Z';
const DOOR_GLASS =
  'M 121 18.6 L 150 18.6 Q 153 18.8 155 20.2 L 171 33.6 Q 173.6 36.4 172.6 38.8 L 121 38.4 Z';
const WINDSHIELD =
  'M 148 13.8 L 156 15 L 164 18.3 L 172 22.7 L 180 26.5 L 188 30.9 Q 192 33.6 196 35.6 L 176.6 35.8 L 158.2 19.8 Q 154.6 15.8 148 13.8 Z';

// Фара: ровная скруглённая капсула 14×8 под линией капота, две круглые линзы 6×6.
// Боковой поворотник на бампере, задний фонарь — круглый, 10×10, во весь угол кормы.
const HEAD = {
  x: 260,
  y: 51,
  rows: [
    [2, 11],
    [1, 12],
    [0, 13],
    [0, 13],
    [0, 13],
    [0, 13],
    [1, 12],
    [2, 11],
  ],
};
const LENS = [
  [1, 4],
  [0, 5],
  [0, 5],
  [0, 5],
  [0, 5],
  [1, 4],
]; // круг 6×6
const LAMPS = [
  [HEAD.x + 1, HEAD.y + 1],
  [HEAD.x + 7, HEAD.y + 1],
];
const SIDE_LAMP = {
  x: 267,
  y: 61,
  rows: [
    [0, 4],
    [0, 4],
    [0, 4],
    [0, 4],
    [0, 4],
    [0, 4],
  ],
};
const TAIL = {
  x: 13,
  y: 37,
  rows: [
    [3, 6],
    [1, 8],
    [1, 8],
    [0, 9],
    [0, 9],
    [0, 9],
    [0, 9],
    [1, 8],
    [1, 8],
    [3, 6],
  ],
};
/** Маска из строк [x0, x1] относительно точки (x, y). */
function rowMask({ x, y, rows }) {
  const bits = new Uint8Array(W * H);
  rows.forEach(([a, b], i) => {
    for (let k = a; k <= b; k++) bits[(y + i) * W + x + k] = 1;
  });
  return new Mask(W, H, bits);
}

// Передний бампер: большой нижний воздухозаборник со шторками, губа; сзади — тонкая кромка.
const INTAKE = 'M 252 68 L 278.8 68 L 279 79.4 L 254 79.6 Q 252.2 74 252 68 Z';
const FRONT_LIP = 'M 244 82.6 L 279 82.6 L 280.4 83.6 L 278.4 85.4 L 246 85.4 Z';
const REAR_DIFFUSER =
  'M 14 80 Q 20 82.4 30 82.6 L 42 82.8 L 42.4 84 L 30 83.8 Q 18 83.4 12.6 80.6 Z';
const HOOD =
  'M 199 36.2 L 212 36.4 L 224 37.7 L 236 40 L 248 42.2 L 260 44.4 L 264 45.3 L 264.4 47.4 L 236 42.4 L 199 38.6 Z';

// ---------- Цвета ----------
const C = {
  outline: '#0b0c10',
  frame: '#0e0f12',
  well: '#08080b',
  trim: '#17181c',
  trimHi: '#2e3036',
  trimLo: '#0f1013',
  glass0: '#4c515b',
  glass1: '#2d3037',
  glass2: '#202228',
  glass3: '#16171b',
  glassStreak: '#3d424c',
  tail: '#a51d28',
  tailHi: '#e9545a',
  tailLo: '#5e0f15',
  tailEdge: '#3a0a0e',
  amber: '#e08c2c',
  chrome: '#80858e',
  metal: '#7a7e86',
  metalHi: '#b8bcc4',
  metalDark: '#45484f',
  rubber: '#141518',
  rubberSide: '#24252a',
  rubberHi: '#393b41',
  disc: '#2f3135',
  discHi: '#3b3e43',
  discDark: '#1c1d20',
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

const rgbCache = new Map();
function rgb(hex) {
  let c = rgbCache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1, 7), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, c);
  }
  return c;
}

function rng(seed) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

// ---------- Холст точек ----------

class Pix {
  constructor(w = W, h = H) {
    this.w = w;
    this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  set(x, y, hex, alpha = 255) {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.inside(x, y)) return;
    const i = (y * this.w + x) * 4;
    const [r, g, b] = rgb(hex);
    this.d[i] = r;
    this.d[i + 1] = g;
    this.d[i + 2] = b;
    this.d[i + 3] = alpha;
  }

  clear(x, y) {
    if (this.inside(x, y)) this.d[(y * this.w + x) * 4 + 3] = 0;
  }

  rect(x, y, w, h, hex, alpha) {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) this.set(xx, yy, hex, alpha);
  }

  /** Линия Брезенхэма; filter(x, y) — где можно ставить точки. */
  line(x0, y0, x1, y1, hex, filter = () => true) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (filter(x0, y0)) this.set(x0, y0, hex);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Ломаная по точкам. */
  poly(points, hex, filter) {
    for (let i = 0; i < points.length - 1; i++)
      this.line(...points[i], ...points[i + 1], hex, filter);
  }

  /** PNG, увеличенный в SCALE раз без сглаживания. */
  png() {
    return sharp(Buffer.from(this.d), { raw: { width: this.w, height: this.h, channels: 4 } })
      .resize(this.w * SCALE, this.h * SCALE, { kernel: 'nearest' })
      .png()
      .toBuffer();
  }
}

/** Маска формы: точка внутри, если её центр внутри контура. */
class Mask {
  constructor(w, h, bits) {
    this.w = w;
    this.h = h;
    this.bits = bits;
  }

  at(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.bits[y * this.w + x] === 1;
  }

  /** Крайняя точка: внутри, но хотя бы один сосед по кресту снаружи. */
  edge(x, y) {
    return (
      this.at(x, y) &&
      (!this.at(x - 1, y) || !this.at(x + 1, y) || !this.at(x, y - 1) || !this.at(x, y + 1))
    );
  }

  or(...others) {
    const bits = this.bits.slice();
    for (const o of others) for (let i = 0; i < bits.length; i++) bits[i] |= o.bits[i];
    return new Mask(this.w, this.h, bits);
  }

  minus(...others) {
    const bits = this.bits.slice();
    for (const o of others) for (let i = 0; i < bits.length; i++) if (o.bits[i]) bits[i] = 0;
    return new Mask(this.w, this.h, bits);
  }
}

async function mask(paths, w = W, h = H) {
  const list = Array.isArray(paths) ? paths : [paths];
  const body = list.map((d) => `<path d="${d}" fill="#fff"/>`).join('');
  const text = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`;
  const { data } = await sharp(Buffer.from(text), { density: 72 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bits = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) bits[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
  return new Mask(w, h, bits);
}

// ---------- Кузов ----------

/** Все маски кузова (один раз на сборку). */
async function bodyMasks() {
  const m = {
    body: await mask(BODY_PATH),
    rearGlass: await mask(REAR_GLASS),
    quarter: await mask(QUARTER_GLASS),
    door: await mask(DOOR_GLASS),
    wind: await mask(WINDSHIELD),
    pillar: await mask(B_PILLAR),
    head: rowMask(HEAD),
    sideLamp: rowMask(SIDE_LAMP),
    tail: rowMask(TAIL),
    intake: await mask(INTAKE),
    lip: await mask(FRONT_LIP),
    diffuser: await mask(REAR_DIFFUSER),
    hood: await mask(HOOD),
  };
  m.sideGlass = m.quarter.or(m.door);
  m.glass = m.sideGlass.or(m.rearGlass, m.wind, m.pillar);
  m.trim = m.head.or(m.sideLamp, m.tail, m.intake, m.lip, m.diffuser);
  // Тёмный низ порога между арками — нижний ряд кузова.
  const sill = new Uint8Array(W * H);
  for (let x = Math.ceil(+RA.a); x <= Math.floor(+FA.b); x++) sill[SILL_ROW * W + x] = 1;
  m.sillDark = new Mask(W, H, sill);
  m.paint = m.body.minus(m.glass, m.trim, m.sillDark);
  return m;
}

const SILL_ROW = Math.round(SILL) - 1; // последний ряд кузова между колёсами
const SKIRT_TOP = 71; // порог: от низа двери до низа кузова

/** Расстояние от центра точки до центра колеса. */
const dist = (x, y, cx) => Math.hypot(x + 0.5 - cx, y + 0.5 - WHEEL_Y);

/** Тон краски в точке: полосы света сверху вниз, торцы темнее борта. */
function paintTone(x, y) {
  let v;
  if (y < 13) v = 0.9;
  else if (y < 38.5) v = 0.95;
  else if (y < 41.5) v = 1;
  else if (y < 47) v = 0.93;
  else if (y < 58) v = 0.88;
  else if (y < 70) v = 0.83;
  else v = 0.8;
  if (y > 58 && x < 46) v -= 0.04; // задний бампер ниже шва
  if (x <= 12) v *= 0.8;
  if (x >= 277) v *= 0.82;
  return v;
}

/** Слой краски (серый) и основы (всё неокрашиваемое), нарисованные по точкам. */
function drawBody(m) {
  const paint = new Pix();
  const base = new Pix();
  const inPaint = (x, y) => m.paint.at(x, y) && !m.body.edge(x, y);
  const P = (v) => gray(v);
  /** Линия с фаской: тёмная щель и светлая кромка рядом (dx, dy — сдвиг кромки). */
  const bevel = (points, dx = 0, dy = 1, dark = 0.42, light = 1) => {
    paint.poly(points, P(dark), inPaint);
    paint.poly(
      points.map(([x, y]) => [x + dx, y + dy]),
      P(light),
      inPaint,
    );
  };

  // 1. Тон краски.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (inPaint(x, y)) paint.set(x, y, P(paintTone(x, y)));

  // 2. Свет на верхних кромках (под контуром крыши, багажника, капота и под стёклами),
  //    тень на нижних.
  for (let y = 1; y < H - 1; y++)
    for (let x = 0; x < W; x++) {
      if (!inPaint(x, y)) continue;
      const above = m.body.edge(x, y - 1) || m.glass.at(x, y - 1);
      if (above && y < 50) paint.set(x, y, P(1));
      if (m.body.edge(x, y + 1) && y > 60) paint.set(x, y, P(0.55));
    }

  // 3. Кромки арок: тень по краю ниши и блик расширителя над ней.
  for (const cx of [REAR_X, FRONT_X])
    for (let y = 0; y < SILL; y++)
      for (let x = Math.floor(cx - ARCH_R - 4); x <= cx + ARCH_R + 4; x++) {
        if (!inPaint(x, y)) continue;
        const d = dist(x, y, cx);
        if (d < ARCH_R + 1.1) paint.set(x, y, P(0.5));
        else if (d < ARCH_R + 2.1 && y < WHEEL_Y + 2) paint.set(x, y, P(1));
        else if (d < ARCH_R + 3.1 && y < WHEEL_Y + 2) paint.set(x, y, P(0.84));
      }

  // 4. Линии борта R34: плечо вдоль заднего крыла и линия, что идёт по двери и
  //    поднимается по заднему крылу к фонарю.
  bevel(
    [
      [16, 44],
      [60, 42.6],
      [108, 41.6],
    ],
    0,
    1,
    0.74,
    1,
  );
  bevel(
    [
      [24, 51],
      [60, 55],
      [110, 60],
      [190, 60],
    ],
    0,
    -1,
    0.7,
    1,
  );

  // 5. Порог между арками: высокий, со светлым ребром посередине.
  const sx0 = Math.ceil(+RA.a) + 1;
  const sx1 = Math.floor(+FA.b) - 1;
  const skirt = [
    [SKIRT_TOP, 0.45], // щель под дверью
    [SKIRT_TOP + 1, 1],
    [SKIRT_TOP + 2, 0.86],
    [SKIRT_TOP + 3, 0.86],
    [SKIRT_TOP + 4, 0.86],
    [SKIRT_TOP + 5, 0.6], // ребро
    [SKIRT_TOP + 6, 0.95],
    [SKIRT_TOP + 7, 0.74],
    [SKIRT_TOP + 8, 0.74],
    [SKIRT_TOP + 9, 0.7],
    [SKIRT_TOP + 10, 0.55],
  ];
  for (const [y, v] of skirt) paint.line(sx0, y, sx1, y, P(v), inPaint);

  // 6. Дверь: задний шов скруглён к стойке B, передний — за передней аркой.
  bevel(
    [
      [116, 39],
      [112, 41],
      [110, 45],
      [110, SKIRT_TOP - 1],
    ],
    1,
    0,
  );
  bevel(
    [
      [191, 40],
      [192, 50],
      [192, 62],
      [191, SKIRT_TOP - 1],
    ],
    -1,
    0,
  );
  // Ручка двери — длинная, как у R34: углубление сверху, ручка светлая, низ темнее.
  paint.line(116, 43, 128, 43, P(0.45), inPaint);
  paint.line(117, 44, 127, 44, P(1), inPaint);
  paint.line(117, 45, 127, 45, P(0.72), inPaint);
  paint.set(116, 44, P(0.6));
  paint.set(128, 44, P(0.6));

  // 7. Шов заднего бампера — ниже фонаря, к арке; передний — от фары к арке.
  bevel([
    [9, 57],
    [42, 57],
    [48, 60],
  ]);
  bevel(
    [
      [261, 59],
      [254, 61],
      [248, 63],
      [245, 65],
    ],
    0,
    1,
    0.45,
    0.97,
  );
  // Линия плеча вдоль капота и крыла.
  paint.poly(
    [
      [199, 38],
      [236, 41.6],
      [262, 46.6],
    ],
    P(0.82),
    inPaint,
  );

  // 8. Основа: стёкла, стойки, фары, фонари, пластик.
  drawGlass(base, m);
  drawLights(base, m);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (m.intake.at(x, y)) base.set(x, y, y % 2 ? C.trimLo : C.trimHi);
      if (m.lip.at(x, y) || m.diffuser.at(x, y)) base.set(x, y, C.trim);
      if (m.sillDark.at(x, y)) base.set(x, y, C.trimLo);
    }
  for (let x = 0; x < W; x++) if (m.lip.at(x, 83)) base.set(x, 83, C.trimHi);
  for (let x = 0; x < W; x++) if (m.diffuser.at(x, 82)) base.set(x, 82, C.trimHi);
  // Маленький отражатель на крыле за передней аркой.
  base.rect(195, 50, 5, 3, C.outline);
  base.rect(196, 51, 3, 1, C.metalHi);

  // 9. Контур кузова и рамки стёкол и фонарей.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (m.body.edge(x, y)) {
        paint.clear(x, y);
        base.set(x, y, C.outline);
      } else if (m.sideGlass.edge(x, y) || m.intake.edge(x, y) || m.lip.edge(x, y)) {
        base.set(x, y, C.frame);
      }
    }
  drawMirror(paint, base);
  return { paint, base };
}

/** Зеркало заднего вида у переднего угла двери: точками, поверх стекла и кузова. */
function drawMirror(paint, base) {
  // Строки корпуса: [y, x0, x1] — включительно, без контура.
  const rows = [
    [33, 167, 174],
    [34, 166, 175],
    [35, 166, 175],
    [36, 166, 175],
    [37, 166, 175],
  ];
  for (const [y, x0, x1] of rows) {
    for (let x = x0; x <= x1; x++) {
      const v = y === 33 ? 1 : y === 37 ? 0.66 : x >= x1 - 1 ? 0.78 : 0.92;
      paint.set(x, y, gray(v));
    }
    for (const x of [x0 - 1, x1 + 1]) {
      paint.clear(x, y);
      base.set(x, y, C.outline);
    }
  }
  for (let x = 167; x <= 174; x++) {
    paint.clear(x, 32);
    base.set(x, 32, C.outline);
  }
  for (let x = 166; x <= 175; x++) {
    paint.clear(x, 38);
    base.set(x, 38, C.outline);
  }
  paint.set(168, 34, gray(1)); // блик
  base.rect(169, 39, 3, 1, C.trim); // ножка
}

function drawGlass(base, m) {
  const tone = (y) => (y <= 20 ? C.glass0 : y <= 24 ? C.glass1 : y <= 31 ? C.glass2 : C.glass3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (m.sideGlass.at(x, y)) base.set(x, y, tone(y));
      if (m.wind.at(x, y)) base.set(x, y, m.wind.at(x + 1, y) ? C.glass2 : C.glass1);
      if (m.rearGlass.at(x, y)) base.set(x, y, m.rearGlass.at(x, y - 1) ? C.glass3 : C.glass1);
      if (m.pillar.at(x, y)) base.set(x, y, C.trimLo);
    }
  // Блики на стёклах — косые полосы, подголовник в салоне.
  const onDoor = (x, y) => m.door.at(x, y) && !m.door.edge(x, y);
  const onQuarter = (x, y) => m.quarter.at(x, y) && !m.quarter.edge(x, y);
  base.line(139, 20, 128, 38, C.glassStreak, onDoor);
  base.line(140, 20, 129, 38, C.glassStreak, onDoor);
  base.line(147, 20, 136, 38, C.glass1, onDoor);
  base.line(108, 21, 99, 36, C.glass1, onQuarter);
  for (let y = 25; y <= 38; y++)
    for (let x = 125; x <= 133; x++) {
      const head = y <= 30 && Math.hypot(x - 129, y - 28) <= 3.6;
      const seat = y > 30 && x >= 126 && x <= 132;
      if ((head || seat) && onDoor(x, y)) base.set(x, y, C.trimLo);
    }
}

function drawLights(base, m) {
  // Фара: чёрная рамка, тёмный отражатель, две линзы в хромовых кольцах — серебристые,
  // светлее сверху слева, тёмный проектор в центре. Светящийся центр — в слое фары.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (m.head.at(x, y)) base.set(x, y, m.head.edge(x, y) ? C.outline : '#24262b');
  for (const [lx, ly] of LAMPS) {
    const lens = rowMask({ x: lx, y: ly, rows: LENS });
    for (let y = ly; y < ly + 6; y++)
      for (let x = lx; x < lx + 6; x++) {
        if (!lens.at(x, y)) continue;
        const i = x - lx;
        const j = y - ly;
        let c = lens.edge(x, y) ? C.chrome : '#c9cdd3';
        if (!lens.edge(x, y) && i + j <= 3) c = '#eef0f3';
        if (!lens.edge(x, y) && i + j >= 7) c = '#9da2aa';
        if (i >= 2 && i <= 3 && j >= 2 && j <= 3) c = '#4a4e56';
        base.set(x, y, c);
      }
  }
  // Боковой поворотник на бампере: оранжевое стекло в рамке, блик сверху.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!m.sideLamp.at(x, y)) continue;
      if (m.sideLamp.edge(x, y)) base.set(x, y, C.outline);
      else base.set(x, y, y === SIDE_LAMP.y + 1 ? '#f4b25a' : C.amber);
    }
  // Круглый задний фонарь: ободок, красное кольцо, тёмное кольцо, красный центр, блик.
  const cx = TAIL.x + 5;
  const cy = TAIL.y + 5;
  for (let y = TAIL.y; y < TAIL.y + 10; y++)
    for (let x = TAIL.x; x < TAIL.x + 10; x++) {
      if (!m.tail.at(x, y)) continue;
      const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      let c = C.tail;
      if (m.tail.edge(x, y)) c = C.tailEdge;
      else if (r > 2.2 && r < 3.3) c = C.tailLo;
      else if (r <= 2.2) c = '#c42630';
      if (!m.tail.edge(x, y) && r >= 3.3 && x + y < cx + cy - 4) c = C.tailHi;
      base.set(x, y, c);
    }
  base.set(cx - 2, cy - 2, '#ffd0d0');
}

function layerHeadlight() {
  const p = new Pix();
  for (const [lx, ly] of LAMPS) {
    p.rect(lx + 2, ly + 2, 2, 2, gray(0.9)); // светящийся проектор
    p.set(lx + 2, ly + 2, gray(1));
  }
  return p;
}

function layerWells() {
  const p = new Pix();
  for (const cx of [REAR_X, FRONT_X])
    for (let y = 0; y < SILL; y++)
      for (let x = Math.floor(cx - ARCH_R); x <= cx + ARCH_R; x++)
        if (dist(x, y, cx) < ARCH_R - 0.4) p.set(x, y, C.well);
  return p;
}

function layerDirt(m) {
  const r = rng(7);
  const p = new Pix();
  const browns = ['#5b4a37', '#6e5a42', '#7d6a50', '#4a3d2e', '#3d3226'];
  for (let y = 40; y < SILL; y++)
    for (let x = 0; x < W; x++) {
      if (!m.paint.at(x, y)) continue;
      const k = ((y - 40) / (SILL - 40)) ** 1.5 * 0.55;
      const nearArch = Math.min(dist(x, y, REAR_X), dist(x, y, FRONT_X)) < ARCH_R + 6;
      if (r() < k + (nearArch ? 0.25 : 0)) p.set(x, y, browns[Math.floor(r() * 5)]);
    }
  // Подтёки с плеча.
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(14 + r() * 252);
    const y0 = Math.floor(42 + r() * 8);
    const len = Math.floor(3 + r() * 9);
    for (let y = y0; y < y0 + len; y++) if (m.paint.at(x, y)) p.set(x, y, '#6e5a42');
  }
  // Пыль на стёклах.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (m.sideGlass.at(x, y) && r() < 0.28) p.set(x, y, r() < 0.5 ? '#8d8a80' : '#a39f94');
  return p;
}

function layerOverlay(kind, m) {
  const p = new Pix();
  if (kind === 'rust') {
    const r = rng(21);
    const rust = ['#7a3a1c', '#93481f', '#b25b26', '#5c2c16', '#c56a2c'];
    const zones = [
      [REAR_X - 26, SILL - 12, 14, 10],
      [REAR_X + 16, SILL - 10, 12, 8],
      [FRONT_X - 28, SILL - 10, 12, 8],
      [FRONT_X + 18, SILL - 12, 12, 10],
      [90, 76, 70, 6],
      [10, 48, 8, 14],
      [240, 42, 12, 4],
    ];
    for (const [zx, zy, zw, zh] of zones)
      for (let y = Math.round(zy); y < zy + zh; y++)
        for (let x = Math.round(zx); x < zx + zw; x++) {
          const k = 1 - Math.hypot((x - zx - zw / 2) / (zw / 2), (y - zy - zh / 2) / (zh / 2));
          if (m.paint.at(x, y) && r() < k * 1.2) p.set(x, y, rust[Math.floor(r() * 5)]);
        }
    return p;
  }
  if (kind === 'cage') {
    const on = (x, y) => m.sideGlass.at(x, y) && !m.sideGlass.edge(x, y);
    p.line(101, 37, 127, 18, C.metal, on);
    p.line(102, 37, 128, 18, C.metalHi, on);
    p.line(82, 21, 176, 21, C.metal, on);
    p.line(82, 22, 176, 22, C.metalHi, on);
    p.line(150, 18, 150, 37, C.metal, on);
    p.line(151, 18, 151, 37, C.metalHi, on);
    const sx0 = Math.ceil(+RA.a) + 1;
    const sx1 = Math.floor(+FA.b) - 1;
    p.rect(sx0, 77, sx1 - sx0 + 1, 6, C.metalDark);
    p.line(sx0, 77, sx1, 77, C.metal);
    p.rect(274, 70, 2, 3, '#d14b2a'); // буксировочная петля
    return p;
  }
  if (kind === 'light') {
    // Карбоновый капот: переплетение точками; тонированные задние стёкла.
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (m.hood.at(x, y) && m.paint.at(x, y) && !m.body.edge(x, y))
          p.set(x, y, (x + y) % 2 ? '#24252a' : '#34363c');
        if (m.quarter.at(x, y) && !m.quarter.edge(x, y)) p.set(x, y, '#0b0e14');
      }
    return p;
  }
  throw new Error(kind);
}

// ---------- Спойлеры ----------

/** Залить форму серым: светлый верх, тень снизу, тёмный контур. */
function shadeShape(p, m, v) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!m.at(x, y)) continue;
      if (m.edge(x, y)) p.set(x, y, C.outline);
      else if (!m.at(x, y - 2)) p.set(x, y, gray(1));
      else if (!m.at(x, y + 2)) p.set(x, y, gray(v - 0.24));
      else p.set(x, y, gray(v));
    }
}

async function layerSpoiler(kind, part) {
  const p = new Pix();
  if (kind === 'lip') {
    if (part !== 'paint') return p;
    // Утиный хвост на крышке багажника.
    const lip = await mask(
      'M 18.6 32.6 L 44 31.4 L 49.6 27.4 Q 49.2 26.6 47.2 26.8 L 21 29.2 Q 18 30 18.6 32.6 Z',
    );
    shadeShape(p, lip, 0.84);
    return p;
  }
  if (part === 'base') {
    // Тень под крылом на крышке багажника.
    for (let x = 19; x < 48; x++) p.set(x, 32, '#000000', 110);
    return p;
  }
  // Антикрыло на высоких стойках, с торцевой пластиной — как у GT-R на чертеже.
  shadeShape(
    p,
    await mask(
      'M 24 32 L 29.6 31.8 L 31.4 23 L 26.6 23.2 Z M 38.4 31.8 L 44 31.6 L 44.6 22.6 L 40 22.8 Z',
    ),
    0.74,
  );
  shadeShape(
    p,
    await mask('M 12 20.2 Q 30 18.6 49 18.8 Q 51 19.2 50.6 21.2 L 50.2 23.2 Q 31 22.6 13 24.4 Z'),
    0.86,
  );
  shadeShape(p, await mask('M 10.4 18 L 13.4 18 L 13.4 26 L 10.4 26 Z'), 0.78);
  return p;
}

// ---------- Кирпичи под передней осью ----------

function layerBricks() {
  const p = new Pix();
  const cx = Math.round(FRONT_X);
  const cy = WHEEL_Y;
  // Голая ступица: тормозной диск с отверстиями, шпильки, суппорт.
  for (let y = Math.floor(cy - 13); y <= cy + 13; y++)
    for (let x = cx - 13; x <= cx + 13; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const a = (Math.atan2(y + 0.5 - cy, x + 0.5 - cx) * 180) / Math.PI + 360;
      if (d > 12.6) continue;
      let c = d > 11.6 ? C.discDark : C.disc;
      if (d < 6) c = C.metalDark;
      if (d < 4.2) c = C.metal;
      if (Math.abs(d - 9) < 0.7 && Math.abs((a % 30) - 15) > 11) c = C.discDark;
      if (Math.abs(d - 2.8) < 0.8 && Math.abs((a % 72) - 36) > 28) c = C.metalHi;
      p.set(x, y, c);
    }
  for (let y = Math.floor(cy - 7); y <= cy + 6; y++)
    for (let x = cx - 16; x <= cx - 11; x++) p.set(x, y, x === cx - 16 ? C.metal : C.caliperGrey);
  // Два ряда кирпичей со сдвигом швов.
  const row = (y, offset) => {
    p.rect(cx - 14, y, 28, 8, C.brick);
    p.rect(cx - 14, y, 28, 1, C.brickHi);
    p.rect(cx - 14, y + 6, 28, 1, C.brickDark);
    p.rect(cx - 14, y + 7, 28, 1, C.mortar);
    for (let bx = cx - 14 + (offset ? 4 : 9); bx < cx + 14; bx += 9) p.rect(bx, y, 1, 7, C.mortar);
    for (let yy = y; yy < y + 8; yy++) {
      p.set(cx - 14, yy, C.brickDark);
      p.set(cx + 13, yy, C.brickDark);
    }
  };
  row(GROUND - 16, false);
  row(GROUND - 8, true);
  return p;
}

// ---------- Колёса: шина + тормоз (не перекрашиваются) и диск (серый) ----------

// Низкий профиль: диск почти во всё колесо.
const TIRES = {
  stock: { rim: 14.6, style: 'multi', caliper: C.caliperGrey },
  studded: { rim: 13.6, style: 'steel', caliper: C.caliperGrey, studs: true },
  slicks: { rim: 15, style: 'six', caliper: C.caliperRed },
  old: { rim: 13.6, style: 'steelOld', caliper: C.caliperGrey, flat: true },
};

const angDist = (a, b) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);
/** Расстояние по углу до ближайшего из n равномерных лучей, начиная с start. */
const toRay = (a, start, n) => {
  const step = 360 / n;
  return angDist(a, start + Math.round((a - start) / step) * step);
};
const lit = (a) => Math.max(0, Math.cos(((a + 135) * Math.PI) / 180)); // свет сверху слева

/** Рисует круглую деталь по точкам: fn(r, градусы, dx, dy) → цвет или null. */
function polar(fn) {
  const p = new Pix(FRAME, FRAME);
  const c = FRAME / 2;
  for (let y = 0; y < FRAME; y++)
    for (let x = 0; x < FRAME; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const color = fn(Math.hypot(dx, dy), (Math.atan2(dy, dx) * 180) / Math.PI, dx, dy);
      if (color) p.set(x, y, color);
    }
  return p;
}

function tirePix(t, angle) {
  const R = WHEEL_R;
  return polar((rr, a, dx, dy) => {
    // Спущенное колесо: нижняя половина шины расплющена и раздута в стороны.
    const r = t.flat && dy > 0 && rr > t.rim ? Math.hypot((dx * R) / (R + 2.2), dy) : rr;
    if (r > R) return null;
    if (r > R - 1) return C.outline;
    if (r > t.rim + 1.4) {
      if (t.studs && r > R - 2 && toRay(a, angle, 28) < 2.4) return '#cfd4dc';
      if (toRay(a, angle, 6) < 4.5 && Math.abs(r - (R + t.rim + 1.4) / 2) < 0.8) return C.rubberHi;
      return lit(a) > 0.55 && r > R - 3 ? C.rubberHi : C.rubberSide;
    }
    if (r > t.rim) return C.rubber;
    // За диском: неподвижный суппорт сзади сверху, тормозной диск с перфорацией.
    const ca = angDist(a, 205);
    if (ca < 24 && r > t.rim - 6 && r < t.rim - 1.2) {
      // Светлая кромка суппорта по внешнему краю.
      if (r > t.rim - 2.4) return t.caliper === C.caliperRed ? C.caliperRedHi : C.metal;
      return t.caliper;
    }
    if (r > t.rim - 1.2) return C.discDark;
    if (Math.abs(r - (t.rim - 3.4)) < 0.6 && toRay(a, angle, 12) < 5) return C.discDark;
    if (r < 4) return C.discDark;
    return r > t.rim - 5 ? C.discHi : C.disc;
  });
}

function rimPix(t, angle) {
  const R = t.rim;
  const nut = (r, a, n, rr) => {
    const ra = (a * Math.PI) / 180;
    for (let i = 0; i < n; i++) {
      const na = ((angle + (i * 360) / n + 36) * Math.PI) / 180;
      const d = Math.hypot(
        r * Math.cos(ra) - rr * Math.cos(na),
        r * Math.sin(ra) - rr * Math.sin(na),
      );
      if (d < 0.9) return true;
    }
    return false;
  };
  return polar((r, a) => {
    if (r > R) return null;
    if (r > R - 1.3) return gray(0.7 + 0.3 * lit(a)); // обод
    if (t.style === 'multi') {
      if (r < 5) {
        if (nut(r, a, 5, 3.4)) return gray(0.45);
        return r < 2.2 ? gray(0.55) : gray(0.86);
      }
      if (r > R - 2.2) return gray(0.5); // полка обода в тени
      // 10 спиц шириной в полторы точки, светлая грань с одной стороны — на низком
      // разрешении сдвоенные тонкие спицы превращаются в шум.
      const hw = ((0.85 + (0.5 * (r - 5)) / (R - 5)) / r) * (180 / Math.PI);
      const step = 36;
      const k = Math.round((a - angle) / step);
      const d = ((((a - (angle + k * step)) % 360) + 540) % 360) - 180;
      if (Math.abs(d) < hw) return gray(d < 0 ? 1 : 0.8);
      return null;
    }
    if (t.style === 'six') {
      if (r < 4.6) {
        if (nut(r, a, 6, 3.2)) return gray(0.45);
        return r < 2 ? gray(0.55) : gray(0.82);
      }
      const hw = ((1.1 + (1.3 * (r - 4.6)) / (R - 4.6)) / r) * (180 / Math.PI);
      const step = 60;
      const k = Math.round((a - angle) / step);
      const d = ((((a - (angle + k * step)) % 360) + 540) % 360) - 180;
      if (Math.abs(d) < hw) return gray(d < -hw * 0.35 ? 1 : d > hw * 0.5 ? 0.62 : 0.86);
      return null;
    }
    // Штампованный стальной: сплошной диск, 8 овальных отверстий, кольцо и гайки.
    const b = t.style === 'steelOld' ? 0.62 : 0.8;
    if (Math.abs(r - R * 0.62) < 1.3 && toRay(a, angle, 8) * (Math.PI / 180) * r < 1.9) return null;
    if (Math.abs(r - R * 0.42) < 0.5) return gray(b + 0.15);
    if (r < 3.6) return nut(r, a, 5, 2.6) ? gray(1) : gray(b - 0.15);
    return gray(b + 0.08 * lit(a));
  });
}

async function strip(makePix) {
  const frames = [];
  for (let i = 0; i < FRAMES; i++) frames.push(await makePix((i * 360) / FRAMES).png());
  const size = FRAME * SCALE;
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

// ---------- Сборка ----------

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const files = {};
  const save = async (name, buf) => {
    writeFileSync(`${OUT}${name}.png`, buf);
    files[name] = buf;
  };

  const m = await bodyMasks();
  const { paint, base } = drawBody(m);
  await save('car_wells', await layerWells().png());
  await save('car_base', await base.png());
  await save('car_paint', await paint.png());
  await save('car_headlight', await layerHeadlight().png());
  await save('car_dirt', await layerDirt(m).png());
  for (const k of ['rust', 'cage', 'light'])
    await save(`car_overlay_${k}`, await layerOverlay(k, m).png());
  await save('car_spoiler_lip_paint', await (await layerSpoiler('lip', 'paint')).png());
  await save('car_spoiler_wing_paint', await (await layerSpoiler('wing', 'paint')).png());
  await save('car_spoiler_wing_base', await (await layerSpoiler('wing', 'base')).png());
  await save('car_bricks', await layerBricks().png());
  for (const [id, t] of Object.entries(TIRES)) {
    await save(`wheel_tire_${id}`, await strip((a) => tirePix(t, a)));
    await save(`wheel_rim_${id}`, await strip((a) => rimPix(t, a)));
  }

  const meta = {
    $comment:
      'Сгенерировано tools/build-car.mjs (npm run car) — не править руками. Координаты в единицах мира; текстуры в density раз крупнее (пиксель-арт без сглаживания).',
    density: SCALE,
    size: { width: W, height: H },
    anchor: { x: W / 2, y: GROUND },
    wheels: { rear: { x: REAR_X, y: WHEEL_Y }, front: { x: FRONT_X, y: WHEEL_Y }, radius: WHEEL_R },
    wheelFrame: { width: FRAME, height: FRAME, frames: FRAMES },
    headlight: { x: 270, y: 55 },
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
  const D = SCALE;
  const tint = async (buf, hex) => {
    const { data, info } = await sharp(buf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const [r, g, b] = rgb(hex);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = (data[i] * r) / 255;
      data[i + 1] = (data[i + 1] * g) / 255;
      data[i + 2] = (data[i + 2] * b) / 255;
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
    { paint: '#2f55c8', tire: 'slicks', overlay: 'light', rim: '#9a9ea6', spoiler: 'wing' },
    { paint: '#8b1a2b', tire: 'studded', overlay: 'cage', rim: '#c0c4c8', spoiler: 'lip' },
  ];
  const rows = [];
  for (const [vi, v] of variants.entries()) {
    const layers = [];
    const add = (input, left = 0, top = 0) =>
      layers.push({ input, left: Math.round(left), top: Math.round(top) });
    add(files.car_wells);
    const pos = (x) => [Math.round(x - FRAME / 2) * D, Math.round(WHEEL_Y - FRAME / 2) * D];
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
