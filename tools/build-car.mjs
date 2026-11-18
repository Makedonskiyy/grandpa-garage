#!/usr/bin/env node
/**
 * build-car — генератор модульной машины игрока («дедова японка»), пиксель-арт.
 *
 * Машина рисуется по точкам на сетке 288×96 (1 точка = 1 единица мира, ≈ 17 мм), как спрайты
 * гоночных пиксельных игр, и сохраняется увеличенной в SCALE раз без сглаживания. Пропорции —
 * купе R34 по фото масштабной модели строго сбоку. Марок, шильдиков и названий нет (ТЗ 2.1).
 *
 * Как рисуется кузов:
 *   1. Формы (кузов, стёкла, фары, пластик) задаются контурами и растеризуются в маски.
 *   2. Каждая точка кузова получает тон: полосы света сверху вниз, «бедро» над задней аркой,
 *      свет на переднем крыле, кромки арок, торцы темнее борта.
 *   3. Поверх — детали точками: швы дверей с фаской (тёмная линия + светлая), порог,
 *      бампера со швами, ручка двери, лючок бензобака, зеркало.
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

// ---------- Пропорции (фото модели R34 сбоку: длина 272 ед. ≈ 4,6 м, база ≈ 2,67 м) ----------
const WHEEL_R = 17.9;
const WHEEL_Y = GROUND - WHEEL_R; // 74.1
const REAR_X = 62.3;
const FRONT_X = 221.4;
const ARCH_R = 20.2;
const SILL = 84; // низ кузова между колёсами
const FRAME = 48; // кадр колеса
const FRAMES = 16;

const arch = (cx) => {
  const dx = Math.sqrt(ARCH_R ** 2 - (SILL - WHEEL_Y) ** 2);
  return { a: (cx + dx).toFixed(2), b: (cx - dx).toFixed(2) };
};
const FA = arch(FRONT_X);
const RA = arch(REAR_X);

const BODY_PATH = [
  'M 24 82.8',
  'Q 13.4 82 10.2 74.6', // низ заднего бампера круто загибается вверх
  'Q 8.6 70 8.4 63',
  'L 8.4 57',
  'Q 8.4 54.8 9.6 54.2',
  'L 11 52.6',
  'L 12 40',
  'Q 12.4 34.6 15.4 33.4', // задний торец крышки багажника
  'Q 18 30 22 28.6',
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
  'Q 263 47.6 266.8 50.6', // нос
  'Q 270 53.4 271.2 57.6',
  'L 271.8 62', // передний бампер
  'Q 272.8 68 272.4 74',
  'L 271.8 80',
  'L 273.6 83.4', // губа
  'L 271.6 85.2',
  'L 244 85.2',
  `L ${FA.a} ${SILL}`,
  `A ${ARCH_R} ${ARCH_R} 0 1 0 ${FA.b} ${SILL}`,
  `L ${RA.a} ${SILL}`,
  `A ${ARCH_R} ${ARCH_R} 0 1 0 ${RA.b} ${SILL}`,
  'L 32 83.6',
  'Z',
].join(' ');

// Остекление: заднее стекло — тёмная полоса над стойкой C; форточка; стойка B; дверное
// стекло до стойки A; лобовое — клин; над стёклами толстая рамка крыши.
const REAR_GLASS =
  'M 58 27.7 L 64 24.4 L 72 19.8 L 80 16 L 88 13.4 Q 94 11.6 99 11.4 L 99 13.4 Q 94.4 13.6 88.6 15.4 L 80.6 18 L 72.6 21.8 L 64.6 26.4 L 61.4 27.7 Z';
const QUARTER_GLASS =
  'M 84 18.6 Q 88 17.2 96 17.2 L 111.4 17.2 L 111.4 37.4 L 96 36 L 82.6 34.8 Q 80.6 34.2 80.8 31.6 L 81.4 21.6 Q 82 19 84 18.6 Z';
const B_PILLAR = 'M 111.4 17.2 L 115.8 17.2 L 115.8 37.8 L 111.4 37.4 Z';
const DOOR_GLASS =
  'M 115.8 17.2 L 150 17.2 Q 152 17.3 153.5 18.2 L 172.4 33.5 Q 175.6 37 175 39.4 L 115.8 38.2 Z';
const WINDSHIELD =
  'M 145.6 12 Q 147.6 12.4 149.4 13.8 L 155.6 16.8 L 164 22.4 L 172.4 27.2 L 180.9 31.9 Q 184.6 33 188 33.4 L 177.4 33.6 L 157.6 17.6 Q 152.4 13.2 145.6 12 Z';
// Фара: скошенный корпус под линией капота, две круглые линзы.
const HEADLIGHT =
  'M 254.6 50.4 L 264.6 50.8 Q 267.4 51.2 267.6 53.8 L 267.2 56.4 Q 266.8 57.4 265.2 57.6 L 256 58.4 Q 254.4 58.4 254.2 56.8 L 254 52 Q 254 50.4 254.6 50.4 Z';
// Линзы: [x, y, радиус] — ближняя крупнее.
const LAMPS = [
  [258.4, 54.4, 3],
  [263.8, 54.2, 2.5],
];
const TAIL =
  'M 13.6 38.6 L 17.4 38.6 Q 18.8 38.6 18.8 40.2 L 18.8 46 Q 18.8 47.6 17.4 47.6 L 13.6 47.6 Q 12.2 47.6 12.2 46 L 12.2 40.2 Q 12.2 38.6 13.6 38.6 Z';
// Передний бампер: большой нижний воздухозаборник, губа; сзади — диффузор.
const INTAKE = 'M 258.8 63.2 L 272.2 63.2 L 272.4 74.4 L 260.6 74.8 Q 259 69.4 258.8 63.2 Z';
const FRONT_LIP = 'M 238 82.4 L 271.8 82.4 L 273.6 83.6 L 271.6 85.2 L 240 85.2 Z';
const REAR_DIFFUSER =
  'M 14 79.6 Q 18.4 82 26 82.4 L 40 82.6 L 40.4 84.2 L 26 83.8 Q 16.4 83.4 12.6 80.4 Z';
const HOOD =
  'M 190 33.4 L 206.2 36.1 L 218.8 37.7 L 231.4 39.8 L 244.1 41.9 L 256.7 45.6 L 257.4 47.6 L 230 42.2 L 190 36 Z';

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
    head: await mask(HEADLIGHT),
    tail: await mask(TAIL),
    intake: await mask(INTAKE),
    lip: await mask(FRONT_LIP),
    diffuser: await mask(REAR_DIFFUSER),
    hood: await mask(HOOD),
  };
  m.sideGlass = m.quarter.or(m.door);
  m.glass = m.sideGlass.or(m.rearGlass, m.wind, m.pillar);
  m.trim = m.head.or(m.tail, m.intake, m.lip, m.diffuser);
  // Тёмный низ порога между арками.
  const sill = new Uint8Array(W * H);
  for (let x = Math.ceil(+RA.a); x <= Math.floor(+FA.b); x++) sill[(SILL - 1) * W + x] = 1;
  m.sillDark = new Mask(W, H, sill);
  m.paint = m.body.minus(m.glass, m.trim, m.sillDark);
  return m;
}

/** Расстояние от центра точки до центра колеса. */
const dist = (x, y, cx) => Math.hypot(x + 0.5 - cx, y + 0.5 - WHEEL_Y);

/** Тон краски в точке: полосы света, бедро над задней аркой, крылья, торцы. */
function paintTone(x, y) {
  let v;
  if (y < 13) v = 0.9;
  else if (y < 38) v = 0.95;
  else if (y < 41) v = 1;
  else if (y < 47) v = 0.93;
  else if (y < 58) v = 0.88;
  else if (y < 68) v = 0.83;
  else v = 0.78;
  // Заднее крыло: мощное «бедро» над аркой — светлая дуга и тень под ней.
  if (x >= 14 && x <= 104) {
    const crest = 46 - 4 * Math.sin((Math.PI * (x - 14)) / 90);
    if (y >= crest - 1 && y < crest) v = 1;
    else if (y >= crest && y < crest + 2) v = 0.8;
    else if (y < crest - 1 && y >= 38) v = 0.96;
  }
  // Задний бампер ниже шва чуть темнее, торцы темнее борта.
  if (y > 53 && x < 10 + (y - 52) * 1.6 + 14) v -= 0.05;
  if (x <= 12) v *= 0.8;
  if (x >= 269) v *= 0.82;
  return v;
}

/** Слой краски (серый) и основы (всё неокрашиваемое), нарисованные по точкам. */
function drawBody(m) {
  const paint = new Pix();
  const base = new Pix();
  const inPaint = (x, y) => m.paint.at(x, y) && !m.body.edge(x, y);
  const P = (v) => gray(v);

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

  // 4. Порог между арками: кромка двери, светлое ребро, грань, тень снизу.
  const sx0 = Math.ceil(+RA.a) + 1;
  const sx1 = Math.floor(+FA.b) - 1;
  paint.line(sx0, 76, sx1, 76, P(0.5), inPaint);
  paint.line(sx0, 77, sx1, 77, P(1), inPaint);
  paint.line(sx0, 78, sx1, 78, P(0.86), inPaint);
  for (const y of [79, 80]) paint.line(sx0, y, sx1, y, P(0.74), inPaint);
  paint.line(sx0, 81, sx1, 81, P(0.62), inPaint);
  paint.line(sx0, 82, sx1, 82, P(0.5), inPaint);

  // 5. Дверь: задний шов прямой, передний повторяет крыло; фаска — тёмная + светлая линия.
  paint.line(106, 38, 106, 75, P(0.42), inPaint);
  paint.line(107, 39, 107, 75, P(1), inPaint);
  const frontSeam = [
    [187, 40],
    [188, 48],
    [188, 62],
    [187, 70],
    [186, 75],
  ];
  paint.poly(frontSeam, P(0.42), inPaint);
  paint.poly(
    frontSeam.map(([x, y]) => [x - 1, y + 1]),
    P(1),
    inPaint,
  );
  // Ручка двери: углубление (тень сверху), сама ручка светлая, торцы и низ темнее.
  paint.line(116, 44, 123, 44, P(0.45), inPaint);
  paint.line(117, 45, 122, 45, P(1), inPaint);
  paint.set(116, 45, P(0.6));
  paint.set(123, 45, P(0.6));
  paint.line(117, 46, 122, 46, P(0.72), inPaint);
  // Лючок бензобака: щель тёмная сверху и слева, светлая снизу и справа.
  paint.line(40, 40, 46, 40, P(0.45), inPaint);
  paint.line(39, 41, 39, 46, P(0.45), inPaint);
  paint.line(40, 47, 46, 47, P(1), inPaint);
  paint.line(47, 41, 47, 46, P(1), inPaint);
  // Шов заднего бампера под фонарём и передний шов от фары к арке.
  const bumperSeam = [
    [10, 52],
    [24, 52],
    [32, 54],
    [38, 57],
    [43, 61],
  ];
  paint.poly(bumperSeam, P(0.45), inPaint);
  paint.poly(
    bumperSeam.map(([x, y]) => [x, y + 1]),
    P(0.97),
    inPaint,
  );
  paint.poly(
    [
      [252, 59],
      [247, 61],
      [243, 64],
      [241, 66],
    ],
    P(0.45),
    inPaint,
  );
  // Линия плеча вдоль капота и крыла.
  paint.poly(
    [
      [196, 37],
      [226, 41],
      [249, 47],
    ],
    P(0.82),
    inPaint,
  );

  // 7. Основа: стёкла, стойки, фары, фонарь, пластик.
  drawGlass(base, m);
  drawLights(base, m);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (m.intake.at(x, y)) base.set(x, y, y % 2 ? C.trimLo : C.trimHi);
      if (m.lip.at(x, y) || m.diffuser.at(x, y)) base.set(x, y, C.trim);
      if (m.sillDark.at(x, y)) base.set(x, y, C.trimLo);
    }
  for (let x = 240; x < 272; x++) if (m.lip.at(x, 83)) base.set(x, 83, C.trimHi);
  for (let x = 16; x < 40; x++) if (m.diffuser.at(x, 82)) base.set(x, 82, C.trimHi);
  base.rect(266, 61, 3, 1, C.amber); // боковой повторитель на углу бампера

  // 8. Контур кузова и рамки стёкол.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (m.body.edge(x, y)) {
        paint.clear(x, y);
        base.set(x, y, C.outline);
      } else if (m.sideGlass.edge(x, y) || m.trim.edge(x, y)) {
        base.set(x, y, m.tail.at(x, y) ? C.tailEdge : C.frame);
      }
    }
  drawMirror(paint, base);
  return { paint, base };
}

/** Зеркало заднего вида у переднего угла двери: точками, поверх стекла и кузова. */
function drawMirror(paint, base) {
  // Строки корпуса: [y, x0, x1] — включительно, без контура.
  const rows = [
    [33, 168, 175],
    [34, 167, 176],
    [35, 167, 176],
    [36, 167, 176],
    [37, 167, 176],
  ];
  for (const [y, x0, x1] of rows) {
    for (let x = x0; x <= x1; x++) {
      const v = y === 33 ? 1 : y === 37 ? 0.66 : x >= x1 - 1 ? 0.78 : 0.92;
      paint.set(x, y, gray(v));
    }
    paint.clear(x0 - 1, y);
    paint.clear(x1 + 1, y);
    base.set(x0 - 1, y, C.outline);
    base.set(x1 + 1, y, C.outline);
  }
  for (let x = 168; x <= 175; x++) {
    paint.clear(x, 32);
    base.set(x, 32, C.outline);
  }
  for (let x = 167; x <= 176; x++) {
    paint.clear(x, 38);
    base.set(x, 38, C.outline);
  }
  paint.set(169, 34, gray(1)); // блик
  base.rect(170, 39, 3, 1, C.trim); // ножка
}

function drawGlass(base, m) {
  const tone = (y) => (y <= 18 ? C.glass0 : y <= 22 ? C.glass1 : y <= 29 ? C.glass2 : C.glass3);
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
  base.line(133, 18, 122, 37, C.glassStreak, onDoor);
  base.line(134, 18, 123, 37, C.glassStreak, onDoor);
  base.line(141, 18, 130, 37, C.glass1, onDoor);
  base.line(101, 18, 93, 34, C.glass1, onQuarter);
  for (let y = 24; y <= 37; y++)
    for (let x = 121; x <= 129; x++) {
      const head = y <= 29 && Math.hypot(x - 125, y - 27) <= 3.6;
      const seat = y > 29 && x >= 122 && x <= 128;
      if ((head || seat) && onDoor(x, y)) base.set(x, y, C.trimLo);
    }
}

function drawLights(base, m) {
  // Корпус фары: чёрная рамка, внутри тёмный отражатель, хромовые кольца вокруг линз,
  // оранжевый поворотник в переднем нижнем углу. Сами линзы — в слое фары (цвет света).
  for (let y = 0; y < H; y++)
    for (let x = 240; x < W; x++) {
      if (!m.head.at(x, y)) continue;
      let c = m.head.edge(x, y) ? C.outline : '#24262b';
      for (const [cx, cy, r] of LAMPS) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d = Math.hypot(dx, dy);
        if (d <= r + 0.5 && d > r - 0.6) c = C.chrome;
        else if (d <= r - 0.6) {
          // Линза: серебристая, светлее сверху слева, тёмный проектор чуть ниже центра.
          const k = Math.max(0, (-dx - dy) / (r * 1.4));
          c = k > 0.5 ? '#eef0f3' : k > 0.15 ? '#c9cdd3' : '#9da2aa';
          if (Math.hypot(dx - 0.3, dy - 0.4) < r * 0.34) c = '#4a4e56';
        }
      }
      base.set(x, y, c);
    }
  base.rect(265, 56, 2, 1, C.amber);
  // Круглый задний фонарь: блик сверху, тень снизу.
  for (let y = 30; y < 52; y++)
    for (let x = 8; x < 22; x++) {
      if (!m.tail.at(x, y)) continue;
      const top = !m.tail.at(x, y - 2);
      const low = !m.tail.at(x, y + 2);
      base.set(x, y, top ? C.tailHi : low ? C.tailLo : C.tail);
    }
  base.set(14, 40, '#ffd0d0');
}

function layerHeadlight() {
  const p = new Pix();
  for (const [cx, cy, r] of LAMPS) {
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d = Math.hypot(dx, dy);
        // Светящийся центр проектора — его цвет задаёт «Внешний вид → Фары».
        if (Math.hypot(dx - 0.3, dy - 0.4) < r * 0.34) p.set(x, y, gray(d < r * 0.2 ? 1 : 0.85));
      }
    p.set(Math.floor(cx - r * 0.45), Math.floor(cy - r * 0.45), gray(1));
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
      [10, 46, 8, 16],
      [236, 42, 12, 4],
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
    p.rect(268, 66, 2, 3, '#d14b2a'); // буксировочная петля
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
      'M 16.6 28.6 L 46 27.4 L 51.6 23.4 Q 51.2 22.6 49.2 22.8 L 19 25.2 Q 16 26 16.6 28.6 Z',
    );
    shadeShape(p, lip, 0.84);
    return p;
  }
  if (part === 'base') {
    // Тень под крылом на крышке багажника.
    for (let x = 17; x < 50; x++) p.set(x, 28, '#000000', 110);
    return p;
  }
  // Антикрыло на высоких стойках, с торцевой пластиной.
  shadeShape(
    p,
    await mask(
      'M 21 28.4 L 26.6 28.2 L 28.4 19.4 L 23.6 19.6 Z M 37.4 28 L 43 27.8 L 43.6 19 L 39 19.2 Z',
    ),
    0.74,
  );
  shadeShape(
    p,
    await mask('M 10 16.6 Q 29 15 48.6 15.2 Q 50.6 15.6 50.2 17.6 L 49.8 19.6 Q 30 19 11 20.8 Z'),
    0.86,
  );
  shadeShape(p, await mask('M 8.4 14.4 L 11.4 14.4 L 11.4 22.4 L 8.4 22.4 Z'), 0.78);
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
  stock: { rim: 13.6, style: 'multi', caliper: C.caliperGrey },
  studded: { rim: 12.4, style: 'steel', caliper: C.caliperGrey, studs: true },
  slicks: { rim: 13.8, style: 'six', caliper: C.caliperRed },
  old: { rim: 12.4, style: 'steelOld', caliper: C.caliperGrey, flat: true },
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
