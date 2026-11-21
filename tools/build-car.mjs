#!/usr/bin/env node
/**
 * build-car — машина игрока («дедова японка»): Nissan Skyline R34 GT-R купе, строго сбоку,
 * пиксель-арт на сетке 864×288 (1 точка = 5,64 мм, точка = пиксель текстуры).
 * Марок и шильдиков нет (ТЗ 2.1).
 *
 * Всё, что видно на чертеже, взято с чертежа — tools/trace-car.mjs переносит его на сетку:
 *   art/source/car/r34-silhouette.png — силуэт кузова (обычный GT-R, без крыла);
 *   art/source/car/r34-parts.png      — стёкла, рамки, тёмный пластик, фара, повторитель, крыло;
 *   art/source/car/r34-lines.png      — линии чертежа: швы, складки, вырезы, ручка, зеркало;
 *   art/source/car/r34-geometry.json  — оси, шина Ø 655 мм, обод Ø 522 мм.
 * Здесь только «покраска» этих карт и мелкие детали, которых чертёж не показывает цветом.
 *
 * Как рисуется (по точкам, без сглаживания):
 *   1. Краска — серая шкала из 10 ступеней: свет сверху, светлое плечо под окнами, тёмная полоса
 *      отражения горизонта, выпуклый порог; торцы темнее; контур — тёмной ступенью той же краски.
 *      Игра перекрашивает слой умножением.
 *   2. Линии чертежа — швы: тёмная щель и точка светлее под ней (свет сверху).
 *   3. Оттенки (hue shift) — слой car_tone поверх краски: холодный свет неба на верхних гранях,
 *      лиловый в глубоких тенях, тёплый отсвет земли снизу.
 *   4. Фара — по контуру и перегородке с чертежа: прозрачное стекло, хромовые отражатели.
 *   5. Колёса — шина и обод по размерам чертежа, шесть спиц; 16 кадров вращения.
 *
 *   npm run car              — собрать в public/assets/images/car и data/car.json
 *   npm run car -- --preview — плюс превью art/preview/car.png и собранный PNG car-r34.png
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}public/assets/images/car/`;
const SRC = `${ROOT}art/source/car/`;
const PREVIEW = process.argv.includes('--preview');

// ---------- Сетка ----------
const GEO = JSON.parse(readFileSync(`${SRC}r34-geometry.json`, 'utf8'));
const W = GEO.grid.width; // 864
const H = GEO.grid.height; // 288
const GROUND = GEO.grid.ground; // 276
const AXF = GEO.axles.front;
const AXR = GEO.axles.rear;
const AXY = GEO.axles.y;
const TIRE_R = GEO.tireRadius; // 58,1 — Ø 655 мм
const RIM_R = GEO.rimRadius; // 46,3 — Ø 522 мм
const ARCH_R = GEO.archRadius;
const FRAME = 144; // кадр колеса, точек
const FRAMES = 16;

// Мир игры: машина 288×96 единиц, кузов x 8…280; 3 точки на единицу.
const WORLD = { width: 288, height: 96 };
const toWorldX = (x) => +(8 + (x - 24) / 3).toFixed(2);
const toWorldY = (y) => +(y / 3).toFixed(2);
const DENSITY = W / WORLD.width; // 3

/** Детали ниже заданы в координатах чертежа на сетке 432×144 — здесь всё вдвое крупнее. */
const X2 = (pts) => pts.map(([x, y]) => [x * 2, y * 2]);

// ---------- Цвета (неперекрашиваемое) ----------
const C = {
  outline: '#0a0b0e',
  frame: '#0d0e11',
  frameHi: '#2a2e35',
  well: '#08080a',
  wellHi: '#15161a',
  trim: '#16171b',
  trimHi: '#2c2f36',
  glassTop: '#3c4758',
  glassMid: '#262d3a',
  glassLow: '#1a1f28',
  glassDeep: '#12151b',
  glassStreak: '#4d5a6e',
  glassShine: '#7e8ca2',
  windTop: '#5a6880',
  windLow: '#323b4b',
  lensGlare: '#eef3f8',
  lensHi: '#c9d3de',
  chrome: '#9aa3ad',
  chromeLo: '#5c636d',
  reflDeep: '#2c3139',
  reflMid: '#4a525d',
  lensEdge: '#15171b',
  amber: '#e2892c',
  amberHi: '#ffc979',
  amberLo: '#a65a16',
  amberEdge: '#3a1e08',
  tail: '#a51d28',
  tailHi: '#ff7a7a',
  tailLo: '#5e0f15',
  tailEdge: '#300709',
  tailCore: '#d8323c',
  metal: '#7a7e86',
  metalHi: '#b8bcc4',
  metalDark: '#45484f',
  rubber: '#16171a',
  rubberSide: '#222327',
  rubberLit: '#30323a',
  rubberHi: '#40434a',
  disc: '#3b3e43',
  discHi: '#555960',
  discDark: '#222428',
  caliperRed: '#b3262c',
  caliperRedHi: '#e04a4a',
  caliperGrey: '#5c6067',
  caliperGreyHi: '#8a8e96',
  brick: '#8e4a33',
  brickHi: '#a85a3e',
  brickDark: '#5e2f21',
  mortar: '#b9a48a',
};

/** Ступени серого краски: контур → тень → … → блик. */
const G = {
  out: 0.2,
  deep: 0.4,
  seam: 0.46,
  dark: 0.54,
  low: 0.62,
  mid: 0.71,
  side: 0.81,
  up: 0.87,
  lit: 0.93,
  hi: 1,
};
const STEPS = Object.values(G).sort((a, b) => a - b);
const snap = (v) =>
  STEPS.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best), STEPS[0]);
/** На ступень светлее. */
const brighter = (v) => STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(snap(v)) + 1)];

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

// ---------- Холст и маски ----------

class Pix {
  constructor(w = W, h = H) {
    this.w = w;
    this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
  }

  set(x, y, hex, alpha = 255) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const [r, g, b] = rgb(hex);
    this.d[i] = r;
    this.d[i + 1] = g;
    this.d[i + 2] = b;
    this.d[i + 3] = alpha;
  }

  clear(x, y) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[(y * this.w + x) * 4 + 3] = 0;
  }

  has(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[(y * this.w + x) * 4 + 3] > 0;
  }

  /** Серое значение 0…1 (для слоя краски). */
  value(x, y) {
    return this.d[(y * this.w + x) * 4] / 255;
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

  png() {
    return sharp(Buffer.from(this.d), { raw: { width: this.w, height: this.h, channels: 4 } })
      .png()
      .toBuffer();
  }
}

class Mask {
  constructor(w = W, h = H, bits) {
    this.w = w;
    this.h = h;
    this.bits = bits ?? new Uint8Array(w * h);
  }

  at(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.bits[y * this.w + x] === 1;
  }

  put(x, y) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.bits[y * this.w + x] = 1;
  }

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

function polyMask(points) {
  const m = new Mask();
  let x0 = W;
  let x1 = 0;
  let y0 = H;
  let y1 = 0;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  for (let y = Math.floor(y0); y <= y1; y++)
    for (let x = Math.floor(x0); x <= x1; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) m.put(x, y);
    }
  return m;
}

/** Эллипс, повёрнутый на tilt градусов (верх — вправо). k(x, y) — 0 в центре, 1 на краю. */
function ellipseK(cx, cy, rx, ry, tilt = 0) {
  const a = (tilt * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return (x, y) => {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    const u = dx * cos + dy * sin;
    const v = -dx * sin + dy * cos;
    return Math.hypot(u / rx, v / ry);
  };
}

function ellipseMask(cx, cy, rx, ry, tilt = 0) {
  const m = new Mask();
  const k = ellipseK(cx, cy, rx, ry, tilt);
  const R = Math.max(rx, ry) + 1;
  for (let y = Math.floor(cy - R); y <= cy + R; y++)
    for (let x = Math.floor(cx - R); x <= cx + R; x++) if (k(x, y) <= 1) m.put(x, y);
  return m;
}

async function loadMaps() {
  const read = async (file) =>
    (await sharp(`${SRC}${file}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data;
  const sil = await read('r34-silhouette.png');
  const parts = await read('r34-parts.png');
  const lines = await read('r34-lines.png');
  const key = {
    '0,0,255': 'door',
    '0,255,255': 'quarter',
    '255,0,255': 'wind',
    '255,128,0': 'rear',
    '0,0,0': 'dark',
    '255,255,0': 'head',
    '0,255,0': 'marker',
    '255,0,0': 'wing',
  };
  const m = { body: new Mask(), lines: new Mask() };
  for (const k of Object.values(key)) m[k] = new Mask();
  for (let i = 0; i < W * H; i++) {
    if (sil[i * 4 + 3]) m.body.bits[i] = 1;
    if (lines[i * 4 + 3]) m.lines.bits[i] = 1;
    if (!parts[i * 4 + 3]) continue;
    const k = key[`${parts[i * 4]},${parts[i * 4 + 1]},${parts[i * 4 + 2]}`];
    if (k) m[k].bits[i] = 1;
  }
  return m;
}

// ---------- Детали, которых чертёж не даёт цветом (координаты чертежа, сетка 432) ----------

const TURN = X2([
  [401, 94],
  [406.8, 94],
  [406.8, 101.4],
  [401, 101.4],
]);
const LOWER_VENT = X2([
  [399, 105.6],
  [403.2, 105.6],
  [403.4, 112.2],
  [399.6, 112.2],
]);
const SIDE_DUCT = X2([
  [372.8, 98.2],
  [379, 99.4],
  [382.4, 115.4],
  [373.4, 115.4],
]);
// Задний фонарь по чертежу: в профиль виден один крупный наклонный овал линзы на углу кормы
// (верх отклонён назад-вверх к крышке багажника), внутри — две круглые лампы, перекрывающие
// друг друга в ракурсе. Наклон tilt — градусы от вертикали.
const TAIL = { cx: 47, cy: 126, rx: 7, ry: 19.5, tilt: 11 };
const TAIL_LAMPS = [
  { cx: 49, cy: 119, rx: 4, ry: 9 },
  { cx: 45, cy: 133, rx: 4, ry: 9.5 },
];
// Фара: две секции, перегородка по чертежу у x ≈ 786; в каждой — отражатель и лампа.
const HEAD_DIVIDER = 788; // перегородка между секциями
// Фара крупнее чертёжной (≈1,3×): та же форма клина — верх по линии капота, скруглённый
// задний угол, скошенный перёд до бампера. Внутри каждой секции — круглая линза в хромовом
// отражателе; цвет линз задаёт «Покраска → Фары».
const HEAD_BIG = [
  [758, 146.6],
  [772, 147.8],
  [790, 150],
  [806, 152.4],
  [815, 154.2],
  [818.6, 157.6],
  [824.6, 176],
  [817, 178.6],
  [768, 178.2],
  [761, 170.5],
  [757, 159],
  [756.6, 151.2],
];
const LAMPS = [
  { cx: 772.5, cy: 163.5, r: 6.2 },
  { cx: 802.5, cy: 164.5, r: 8 },
];
const MIRROR_BOX = { x0: 490, x1: 526, y0: 92, y1: 114 };
// Плечо и линия двери — для полос света (сами линии рисует чертёж).
const SHOULDER = X2([
  [27, 64.4],
  [60, 65.2],
  [90, 66],
  [111, 66.6],
  [140, 70.6],
  [164, 75],
]);
const DOOR_LINE = X2([
  [146, 90.6],
  [220, 92.2],
  [296, 94],
]);
const DUCKTAIL = X2([
  [21, 50.4],
  [22.6, 47.4],
  [38, 47],
  [48, 48.6],
  [50, 50.6],
]);

const dist = (x, y, cx) => Math.hypot(x + 0.5 - cx, y + 0.5 - AXY);

function along(points, x) {
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    if ((x >= ax && x <= bx) || (x <= ax && x >= bx))
      return ay + ((by - ay) * (x - ax)) / (bx - ax || 1);
  }
  return null;
}

// ---------- Кузов ----------

async function bodyMasks() {
  const m = await loadMaps();
  // Обычный GT-R: под передним бампером — сплошная чёрная губа, сзади — чёрная кромка.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (m.body.at(x, y) && ((x > 700 && y >= 240) || (x < 150 && y >= 232))) m.dark.put(x, y);
  m.side = m.door.or(m.quarter);
  m.glass = m.side.or(m.wind, m.rear);
  m.turn = polyMask(TURN);
  m.vent = polyMask(LOWER_VENT);
  m.duct = polyMask(SIDE_DUCT);
  m.tail = ellipseMask(TAIL.cx, TAIL.cy, TAIL.rx, TAIL.ry, TAIL.tilt);
  // Фара — крупнее чертёжной, но в пределах кузова.
  const head = polyMask(HEAD_BIG);
  m.head = head.minus(head.minus(m.body));
  m.trim = m.dark.or(m.head, m.turn, m.vent, m.duct, m.marker, m.tail);
  m.hood = new Mask();
  const hood = X2([
    [290, 55],
    [330, 57.2],
    [370, 63.4],
    [409, 75.2],
  ]);
  for (let x = 580; x < 824; x++) {
    const yl = along(hood, x) ?? 152;
    for (let y = 0; y < yl; y++) if (m.body.at(x, y) && !m.glass.at(x, y)) m.hood.put(x, y);
  }
  m.paint = m.body.minus(m.glass, m.trim);
  return m;
}

function topEdge(m) {
  const top = new Int16Array(W).fill(-1);
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++)
      if (m.body.at(x, y)) {
        top[x] = y;
        break;
      }
  return top;
}

/** Тон краски: полосы света по высоте, плечо, отражение горизонта, порог, торцы. */
function paintTone(x, y, top) {
  const sh = along(SHOULDER, x);
  const dl = along(DOOR_LINE, x);
  let v;
  if (y < 94)
    v = G.lit; // стойки, крыша, багажник
  else if (y < 124 || (sh !== null && y < sh))
    v = G.lit; // плечо под окнами
  else if (y < 168) v = G.side;
  else if (y < 184) v = G.mid;
  else if (y < 206) v = G.low;
  else if (y < 216)
    v = G.up; // порог выпуклый — ловит свет
  else if (y < 228) v = G.mid;
  else v = G.dark;
  if (sh !== null && y > sh && y <= sh + 6)
    v = G.low; // отражение горизонта
  else if (sh === null && y >= 124 && y <= 128 && x > 328) v = G.mid;
  if (dl !== null && y > dl && y <= dl + 4) v = G.dark;
  if (top[x] >= 0 && y - top[x] <= 4 && y < 160) v = G.hi;
  else if (top[x] >= 0 && y - top[x] <= 10 && y < 120) v = Math.max(v, G.lit);
  if (x > 580 && y < 128 && y - top[x] > 4) v = x > 760 ? G.up : G.lit;
  if (x < 34) v -= 0.14;
  else if (x < 48) v -= 0.07;
  if (x > 828) v -= 0.14;
  else if (x > 816) v -= 0.07;
  return v;
}

function drawBody(m) {
  const paint = new Pix();
  const base = new Pix();
  const tone = new Pix();
  const top = topEdge(m);
  const inPaint = (x, y) => m.paint.at(x, y) && !m.body.edge(x, y);

  // 1. Тон краски, один ряд дизеринга на переходе в середине двери.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (inPaint(x, y)) paint.set(x, y, gray(snap(paintTone(x, y, top))));
  for (let x = 0; x < W; x += 2)
    if (inPaint(x, 168) && paintTone(x, 167, top) > paintTone(x, 168, top))
      paint.set(x, 168, gray(G.side));

  // 2. Блик под окнами.
  for (let y = 1; y < 128; y++)
    for (let x = 0; x < W; x++)
      if (inPaint(x, y) && (m.glass.at(x, y - 1) || m.dark.at(x, y - 1)))
        paint.set(x, y, gray(G.hi));

  // 3. Арки: тень у ниши, блик кромки.
  for (const cx of [AXR, AXF])
    for (let y = 0; y < H; y++)
      for (let x = Math.floor(cx - ARCH_R - 12); x <= cx + ARCH_R + 12; x++) {
        if (!inPaint(x, y)) continue;
        const d = dist(x, y, cx);
        if (d < ARCH_R + 1.5) paint.set(x, y, gray(G.dark));
        else if (d < ARCH_R + 3.5 && y < AXY + 8) paint.set(x, y, gray(G.hi));
      }

  // 4. Линии чертежа — швы: щель темнее, точка под ней на ступень светлее.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!m.lines.at(x, y) || !m.paint.at(x, y) || m.body.edge(x, y)) continue;
      paint.set(x, y, gray(y > 196 ? G.low : G.dark));
    }
  for (let y = H - 2; y >= 0; y--)
    for (let x = 0; x < W; x++)
      if (
        y < 196 &&
        m.lines.at(x, y) &&
        m.paint.at(x, y) &&
        inPaint(x, y + 1) &&
        !m.lines.at(x, y + 1)
      )
        paint.set(x, y + 1, gray(brighter(paint.value(x, y + 1))));

  // 5. Основа: стёкла, рамки, оптика, пластик.
  drawGlass(base, m);
  drawLights(base, m);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (m.dark.at(x, y)) base.set(x, y, y > 220 ? C.trim : C.frame);
      if (m.vent.at(x, y)) base.set(x, y, y % 3 ? C.trim : C.trimHi);
      if (m.duct.at(x, y)) base.set(x, y, (y - 196) % 6 < 2 ? C.trimHi : C.trim);
    }
  // Глянец стойки B — вертикальный блик; верхняя кромка чёрного низа светлее.
  for (let y = 52; y < 112; y++)
    for (const x of [348, 349]) if (m.dark.at(x, y)) base.set(x, y, C.frameHi);
  for (let x = 0; x < W; x++)
    for (let y = 200; y < H; y++)
      if (m.dark.at(x, y) && !m.dark.at(x, y - 1)) base.set(x, y, C.trimHi);

  // 6. Контур: кузов — тёмной ступенью краски (selective outline), снизу — чёрный.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!m.body.edge(x, y)) continue;
      base.set(x, y, C.outline);
      if (m.paint.at(x, y) && y < 224) paint.set(x, y, gray(G.out));
      else paint.clear(x, y);
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (m.side.edge(x, y) && !m.dark.at(x, y)) base.set(x, y, C.frame);

  drawMirror(paint, m, top);
  drawTone(tone, paint, m, top);
  return { paint, base, tone };
}

/** Зеркало: корпус в цвет кузова — светлый верх, тень снизу; контур — линии чертежа. */
function drawMirror(paint, m) {
  const { x0, x1, y0, y1 } = MIRROR_BOX;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!m.paint.at(x, y) || m.lines.at(x, y)) continue;
      const rel = (y - y0) / (y1 - y0);
      paint.set(x, y, gray(rel < 0.2 ? G.hi : rel < 0.7 ? G.lit : G.mid));
    }
}

function drawGlass(base, m) {
  const side = (y) =>
    y <= 60 ? C.glassTop : y <= 72 ? C.glassMid : y <= 96 ? C.glassLow : C.glassDeep;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (m.side.at(x, y)) base.set(x, y, side(y));
      if (m.wind.at(x, y)) base.set(x, y, m.wind.at(x - 2, y - 2) ? C.windLow : C.windTop);
      if (m.rear.at(x, y)) base.set(x, y, m.rear.at(x, y - 2) ? C.glassMid : C.windTop);
    }
  const onDoor = (x, y) => m.door.at(x, y) && !m.door.edge(x, y);
  const onQuarter = (x, y) => m.quarter.at(x, y) && !m.quarter.edge(x, y);
  // Отражение неба — косые полосы.
  for (let k = 0; k < 6; k++) base.line(428 + k, 54, 396 + k, 116, C.glassStreak, onDoor);
  for (let k = 0; k < 2; k++) base.line(442 + k, 54, 410 + k, 116, C.glassStreak, onDoor);
  for (let k = 0; k < 3; k++) base.line(292 + k, 60, 276 + k, 94, C.glassStreak, onQuarter);
  // Сиденье в салоне — тёмный силуэт по контуру с чертежа.
  for (let y = 68; y < 120; y++)
    for (let x = 368; x <= 398; x++) {
      const head = y <= 82 && Math.hypot(x - 382, y - 75) <= 8;
      const back = y > 82 && x >= 372 && x <= 396 - Math.max(0, (y - 100) * 0.3);
      if ((head || back) && onDoor(x, y)) base.set(x, y, C.glassDeep);
    }
  // Линии чертежа на стёклах (уплотнители) — тёмные.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (m.lines.at(x, y) && m.glass.at(x, y)) base.set(x, y, C.frame);
}

function paintLens(p, mk, edge, fill, hi, lo) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!mk.at(x, y)) continue;
      let c = mk.edge(x, y) ? edge : fill;
      if (!mk.edge(x, y) && !mk.at(x, y - 2)) c = hi;
      else if (!mk.edge(x, y) && !mk.at(x, y + 2)) c = lo;
      p.set(x, y, c);
    }
}

/**
 * Фара по чертежу: клин под капотом со скруглённым задним углом и скошенной передней кромкой.
 * Стекло прозрачное: сверху блик неба, под ним хром отражателей двух секций, к низу темнее.
 * Перегородка и кромки стекла — линии с чертежа; в каждой секции — лампа (её цвет в игре
 * задаёт «Внешний вид → Фары»).
 */
function drawLights(base, m) {
  let top = H;
  let bottom = 0;
  for (let y = 0; y < H; y++)
    for (let x = 740; x < W; x++)
      if (m.head.at(x, y)) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  for (let y = 0; y < H; y++)
    for (let x = 740; x < W; x++) {
      if (!m.head.at(x, y)) continue;
      if (m.head.edge(x, y)) {
        base.set(x, y, C.lensEdge);
        continue;
      }
      const t = (y - top) / (bottom - top);
      let c =
        t < 0.14
          ? C.lensGlare
          : t < 0.3
            ? C.lensHi
            : t < 0.55
              ? C.chrome
              : t < 0.8
                ? C.reflMid
                : C.reflDeep;
      // Косой блик по стеклу.
      if (Math.abs(x - 2 * y - (790 - 2 * 158)) < 1.5 && t < 0.7) c = C.lensGlare;
      if (Math.abs(x + 0.5 - HEAD_DIVIDER) < 0.8 && t > 0.12) c = C.chromeLo;
      // Линза в отражателе: тёмное кольцо, хромовая чаша, светлое стекло с бликом слева сверху.
      for (const L of LAMPS) {
        const k = Math.hypot(x + 0.5 - L.cx, y + 0.5 - L.cy) / L.r;
        if (k > 1) continue;
        if (k > 0.86) c = C.reflDeep;
        else if (k > 0.58) c = y + 0.5 < L.cy ? C.chrome : C.reflMid;
        else c = k < 0.22 && x + 0.5 < L.cx && y + 0.5 < L.cy ? C.lensGlare : C.lensHi;
      }
      base.set(x, y, c);
    }
  paintLens(base, m.turn, C.amberEdge, C.amber, C.amberHi, C.amberLo);
  paintLens(base, m.marker, C.amberEdge, C.amber, C.amberHi, C.amberLo);
  // Задний фонарь: тёмная рамка, красная линза с бликом по верху, две лампы внутри —
  // тёмное кольцо, светлое кольцо отражателя и яркая середина.
  const outer = ellipseK(TAIL.cx, TAIL.cy, TAIL.rx, TAIL.ry, TAIL.tilt);
  const lamps = TAIL_LAMPS.map((L) => ellipseK(L.cx, L.cy, L.rx, L.ry, TAIL.tilt));
  for (let y = 0; y < H; y++)
    for (let x = 20; x < 76; x++) {
      if (!m.tail.at(x, y)) continue;
      const k = outer(x, y);
      let c = m.tail.edge(x, y) ? C.tailEdge : k > 0.82 ? C.tailLo : C.tail;
      // Блик линзы — полоса у верхнего края со стороны света.
      if (!m.tail.edge(x, y) && k > 0.62 && k < 0.84 && y < TAIL.cy - 6 && x < TAIL.cx + 3)
        c = C.tailHi;
      for (const lk of lamps) {
        const v = lk(x, y);
        if (v <= 1 && v > 0.78) c = C.tailEdge;
        else if (v <= 0.78 && v > 0.52) c = C.tailLo;
        else if (v <= 0.52) c = v < 0.26 ? '#ff9a8a' : C.tailCore;
      }
      base.set(x, y, c);
    }
}

/** Оттенки поверх краски (hue shift) — полупрозрачно, работает с любым цветом кузова. */
function drawTone(tone, paint, m, top) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!paint.has(x, y) || !m.paint.at(x, y) || m.body.edge(x, y)) continue;
      const v = paint.value(x, y);
      if (v >= 0.99 && y < 160) tone.set(x, y, '#c8dcff', 70);
      else if (v >= 0.92 && y - top[x] < 16) tone.set(x, y, '#b8ccef', 40);
      else if (v <= 0.5) tone.set(x, y, '#2a1840', 60);
      else if (y > 200) tone.set(x, y, '#6b4a2e', 34);
    }
}

/** Свет фары: середина отражателей обеих секций — её цвет задаёт «Внешний вид → Фары». */
function layerHeadlight(m) {
  const p = new Pix();
  let top = H;
  let bottom = 0;
  for (let y = 0; y < H; y++)
    for (let x = 740; x < W; x++)
      if (m.head.at(x, y)) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  for (let y = 0; y < H; y++)
    for (let x = 740; x < W; x++) {
      if (!m.head.at(x, y) || m.head.edge(x, y)) continue;
      // Светится стекло линз: середина ярче, к краю — слабее.
      for (const L of LAMPS) {
        const k = Math.hypot(x + 0.5 - L.cx, y + 0.5 - L.cy) / L.r;
        if (k <= 0.58) p.set(x, y, gray(k < 0.3 ? 1 : 0.9), k < 0.3 ? 230 : 190);
      }
    }
  return p;
}

/**
 * Тень на полу. Свет от лампы сверху, камера чуть выше машины, поэтому видна полоса пола
 * под порогом: она в густой тени, у шин — самые тёмные пятна контакта, вокруг машины —
 * мягкий край ступенями с шахматкой на последней. Слой 60 точек: земля — строка SHADOW_GROUND,
 * выше неё 14 единиц мира (пол под днищем), ниже — 6.
 */
const SHADOW_H = 60;
const SHADOW_GROUND = 42;
function layerShadow(m) {
  const p = new Pix(W, SHADOW_H);
  const g = SHADOW_GROUND;
  const cx = (24 + 840) / 2;
  // Низ кузова в каждом столбце — до него виден пол под машиной.
  const bottom = new Int16Array(W).fill(-1);
  for (let x = 0; x < W; x++)
    for (let y = H - 1; y >= 0; y--)
      if (m.body.at(x, y)) {
        bottom[x] = y;
        break;
      }
  for (let y = 0; y < SHADOW_H; y++)
    for (let x = 0; x < W; x++) {
      const yy = y + 0.5 - g; // < 0 — выше земли (дальше по полу)
      const k = Math.hypot((x + 0.5 - cx) / 440, yy / (yy < 0 ? 22 : 15));
      let al = 0;
      if (k < 0.6) al = 110;
      else if (k < 0.82) al = 80;
      else if (k < 0.94) al = 50;
      else if (k < 1.02 && (x + y) % 2 === 0) al = 50;
      // Пол под порогом между колёсами — от земли до низа кузова.
      const under = bottom[x] >= 0 ? GROUND - bottom[x] : 0;
      if (yy < 0 && -yy <= under + 1 && x > AXR + TIRE_R * 0.5 && x < AXF - TIRE_R * 0.5)
        al = Math.max(al, -yy > under - 3 ? 120 : 165);
      for (const ax of [AXR, AXF]) {
        const kc = Math.hypot((x + 0.5 - ax) / (TIRE_R * 0.95), yy / 5);
        if (kc < 1) al = Math.max(al, kc < 0.55 ? 225 : 185);
      }
      if (al) p.set(x, y, '#060505', al);
    }
  return p;
}

function layerWells(m) {
  const p = new Pix();
  for (const cx of [AXR, AXF])
    for (let y = 0; y < GROUND; y++)
      for (let x = Math.floor(cx - ARCH_R - 2); x <= cx + ARCH_R + 2; x++) {
        const d = dist(x, y, cx);
        if (d < ARCH_R + 1 && !m.body.at(x, y))
          p.set(x, y, d > ARCH_R - 6 && y < AXY ? C.wellHi : C.well);
      }
  return p;
}

function layerDirt(m) {
  const r = rng(7);
  const p = new Pix();
  const browns = ['#5b4a37', '#6e5a42', '#7d6a50', '#4a3d2e'];
  for (let y = 120; y < H; y += 1)
    for (let x = 0; x < W; x++) {
      if (!m.paint.at(x, y) || (x + y) % 2) continue; // брызги по 2×2 — не шумная крошка
      const k = ((y - 120) / 124) ** 1.6 * 0.5;
      const nearArch = Math.min(dist(x, y, AXR), dist(x, y, AXF)) < ARCH_R + 14;
      if (r() < k + (nearArch ? 0.22 : 0)) {
        const c = browns[Math.floor(r() * 4)];
        p.set(x, y, c);
        if (m.paint.at(x + 1, y)) p.set(x + 1, y, c);
      }
    }
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(36 + r() * 780);
    const y0 = Math.floor(128 + r() * 24);
    const len = Math.floor(8 + r() * 28);
    for (let y = y0; y < y0 + len; y++)
      for (const dx of [0, 1]) if (m.paint.at(x + dx, y)) p.set(x + dx, y, '#6e5a42');
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (m.glass.at(x, y) && r() < 0.08) p.set(x, y, r() < 0.5 ? '#8d8a80' : '#a39f94');
  return p;
}

function layerOverlay(kind, m) {
  const p = new Pix();
  if (kind === 'rust') {
    const r = rng(21);
    const rust = ['#7a3a1c', '#93481f', '#b25b26', '#5c2c16', '#c56a2c'];
    const zones = [
      [AXR - 80, 196, 32, 44],
      [AXR + 52, 200, 28, 36],
      [AXF - 80, 200, 28, 32],
      [AXF + 52, 192, 28, 40],
      [280, 208, 300, 20],
      [28, 140, 24, 52],
      [720, 120, 40, 12],
    ];
    for (const [zx, zy, zw, zh] of zones)
      for (let y = Math.round(zy); y < zy + zh; y += 2)
        for (let x = Math.round(zx); x < zx + zw; x += 2) {
          const k = 1 - Math.hypot((x - zx - zw / 2) / (zw / 2), (y - zy - zh / 2) / (zh / 2));
          if (!m.paint.at(x, y) || r() > k * 1.2) continue;
          const c = rust[Math.floor(r() * 5)];
          for (const [dx, dy] of [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ])
            if (m.paint.at(x + dx, y + dy)) p.set(x + dx, y + dy, c);
        }
    return p;
  }
  if (kind === 'cage') {
    const on = (x, y) => m.side.at(x, y) && !m.side.edge(x, y);
    const bar = (a, b) => {
      for (const k of [0, 1]) p.line(a[0] + k, a[1], b[0] + k, b[1], C.metal, on);
      p.line(a[0] + 2, a[1], b[0] + 2, b[1], C.metalHi, on);
    };
    bar([480, 60], [532, 112]);
    bar([356, 68], [536, 68]);
    bar([240, 104], [320, 56]);
    p.rect(820, 232, 6, 8, '#d14b2a'); // буксировочная петля
    return p;
  }
  if (kind === 'light') {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (m.hood.at(x, y) && m.paint.at(x, y) && !m.body.edge(x, y))
          p.set(x, y, ((x >> 1) + (y >> 1)) % 2 ? '#24252a' : (x >> 2) % 2 ? '#34363c' : '#2c2e33');
        if (m.quarter.at(x, y) && !m.quarter.edge(x, y)) p.set(x, y, '#0b0e14');
      }
    return p;
  }
  throw new Error(kind);
}

// ---------- Спойлеры ----------

function shadeShape(p, mk, v) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!mk.at(x, y)) continue;
      if (mk.edge(x, y)) p.set(x, y, gray(G.out));
      else if (!mk.at(x, y - 3)) p.set(x, y, gray(G.hi));
      else if (!mk.at(x, y + 3)) p.set(x, y, gray(v - 0.24));
      else p.set(x, y, gray(v));
    }
}

function layerSpoiler(kind, part, m) {
  const p = new Pix();
  if (kind === 'lip') {
    if (part === 'paint') shadeShape(p, polyMask(DUCKTAIL), 0.84);
    return p;
  }
  // Штатное крыло GT-R — с чертежа (класс wing в карте деталей).
  if (part === 'base') {
    for (let x = 44; x < 100; x++) for (const y of [102, 103]) p.set(x, y, '#000000', 90);
    return p;
  }
  shadeShape(p, m.wing, 0.86);
  return p;
}

// ---------- Кирпичи под передней осью ----------

function layerBricks() {
  const p = new Pix();
  const cx = AXF;
  const cy = AXY;
  for (let y = Math.floor(cy - 38); y <= cy + 38; y++)
    for (let x = Math.floor(cx - 38); x <= cx + 38; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const a = (Math.atan2(y + 0.5 - cy, x + 0.5 - cx) * 180) / Math.PI + 360;
      if (d > 36.8) continue;
      let c = d > 34.4 ? C.discDark : d > 30 ? C.discHi : C.disc;
      if (d < 18) c = C.metalDark;
      if (d < 12.8) c = C.metal;
      if (Math.abs(d - 25) < 1.6 && Math.abs((a % 24) - 12) > 8) c = C.discDark;
      if (Math.abs(d - 8.4) < 1.8 && Math.abs((a % 72) - 36) > 26) c = C.metalHi;
      p.set(x, y, c);
    }
  for (let y = Math.floor(cy - 20); y <= cy + 18; y++)
    for (let x = Math.floor(cx - 46); x <= cx - 32; x++)
      p.set(x, y, x <= cx - 44 ? C.metal : C.caliperGrey);
  const bx = Math.round(cx - 42);
  const row = (y, offset) => {
    p.rect(bx, y, 84, 24, C.brick);
    p.rect(bx, y, 84, 3, C.brickHi);
    p.rect(bx, y + 20, 84, 2, C.brickDark);
    p.rect(bx, y + 22, 84, 2, C.mortar);
    for (let k = bx + (offset ? 12 : 26); k < bx + 84; k += 28) p.rect(k, y, 2, 22, C.mortar);
    for (let yy = y; yy < y + 24; yy++)
      for (const xx of [bx, bx + 1, bx + 82, bx + 83]) p.set(xx, yy, C.brickDark);
  };
  row(GROUND - 48, false);
  row(GROUND - 24, true);
  return p;
}

// ---------- Колёса: тормоз, шина, диск — три слоя ----------
//
// Шины и диски — отдельные детали. Диаметр шины один (Ø 655 мм по чертежу), диски — трёх
// размеров: 16″ (штампы), 17″ (родные, сетка), 18″ (пятилучевые, кованые). Шина рисуется под
// каждый размер диска (боковина выше у маленького диска), тормоз — под каждый диск: за
// большими дисками — красные суппорты, за штампами — простые серые.

const RIM_SIZE = { s: RIM_R - 3, m: RIM_R, l: RIM_R + 2.5 };
const RIMS = {
  six: { size: 'm', caliper: C.caliperGrey },
  steel: { size: 's', caliper: C.caliperGrey },
  steelOld: { size: 's', caliper: C.caliperGrey },
  mesh: { size: 'm', caliper: C.caliperGrey },
  five: { size: 'l', caliper: C.caliperRed },
  multi: { size: 'l', caliper: C.caliperRed },
};
const TIRE_KINDS = {
  stock: {},
  studded: { studs: true },
  mud: { lugs: true },
  sport: { stripe: true },
  slicks: { slick: true },
  old: { flat: true },
};

const angDist = (a, b) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);
const toRay = (a, start, n) => {
  const step = 360 / n;
  return angDist(a, start + Math.round((a - start) / step) * step);
};
const spoke = (a, angle, n) => {
  const step = 360 / n;
  const k = Math.round((a - angle) / step);
  return ((((a - (angle + k * step)) % 360) + 540) % 360) - 180;
};
const lit = (a) => Math.max(0, Math.cos(((a + 135) * Math.PI) / 180)); // свет сверху слева

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

/** Шина: резина от обода до протектора; t — вид шины, rim — радиус диска. */
function tirePix(t, rim, angle) {
  const R = TIRE_R;
  return polar((rr, a, dx, dy) => {
    const r = t.flat && dy > 0 && rr > rim ? Math.hypot((dx * R) / (R + 6), dy) : rr;
    if (r > R || r <= rim) return null;
    // Грязевая: шашки протектора выступают по кромке — силуэт «зубчатый».
    if (t.lugs && r > R - 2.4) return toRay(a, angle, 26) < 3.2 ? C.outline : null;
    if (t.studs && r > R - 2.2 && toRay(a, angle, 30) < 1.1) return '#8d939b';
    if (r > R - 1.6) return C.outline;
    if (r > rim + 1.6) {
      const L = lit(a);
      if (t.lugs && r > R - 7 && toRay(a, angle + 7, 26) < 2.4) return C.rubberLit; // боковые шашки
      if (r > R - 4) {
        if (t.slick) return L > 0.45 ? C.rubberLit : C.rubberSide; // гладкое плечо с бликом
        return L > 0.6 ? C.rubberSide : C.rubber; // плечо протектора
      }
      if (r < rim + 3) return C.rubber; // борт у обода
      if (t.stripe && Math.abs(r - (rim + 4.5)) < 0.7) return '#6b6e75'; // кант на боковине
      if (Math.abs(r - (R - 6)) < 0.8 && L > 0.3 && !t.slick) return C.rubberHi;
      return L > 0.7 ? C.rubberLit : L > 0.25 ? C.rubberSide : C.rubber;
    }
    return C.outline; // край у обода
  });
}

/** Тормоз за диском: суппорт сверху сзади (не крутится) и диск с перфорацией (крутится). */
function brakePix(rimDef, angle) {
  const R = RIM_SIZE[rimDef.size];
  const red = rimDef.caliper === C.caliperRed;
  return polar((r, a) => {
    if (r > R) return null;
    const ca = angDist(a, 205);
    if (ca < (red ? 26 : 22) && r > R - (red ? 17 : 15) && r < R - 3) {
      if (r > R - 6) return red ? C.caliperRedHi : C.caliperGreyHi;
      return rimDef.caliper;
    }
    if (r > R - 3) return C.discDark;
    if (Math.abs(r - (R - 9)) < 1.2 && toRay(a, angle, 24) < 3) return C.discDark;
    if (r < 10) return C.discDark;
    return r > R - 12 ? C.discHi : C.disc;
  });
}

/** Диск: обод и спицы по стилю. */
function rimPix(rimDef, style, angle) {
  const R = RIM_SIZE[rimDef.size];
  const nut = (r, a, n, rr) => {
    const ra = (a * Math.PI) / 180;
    for (let i = 0; i < n; i++) {
      const na = ((angle + (i * 360) / n + 36) * Math.PI) / 180;
      const d = Math.hypot(
        r * Math.cos(ra) - rr * Math.cos(na),
        r * Math.sin(ra) - rr * Math.sin(na),
      );
      if (d < 2) return true;
    }
    return false;
  };
  const hub = (r, a, nutR = 8.6) => {
    if (nut(r, a, 5, nutR)) return gray(0.42);
    return r < 5 ? gray(0.55) : r > 11 ? gray(0.6) : gray(0.86);
  };
  return polar((r, a) => {
    if (r > R) return null;
    const L = lit(a);
    // Обод: полированная полка, светлая сверху слева; внутренняя ступень темнее.
    if (r > R - 2.6) return gray(0.72 + 0.28 * L);
    if (r > R - 4.6) return gray(0.5);
    if (style === 'six' || style === 'five') {
      if (r < 13) return hub(r, a);
      const n = style === 'six' ? 6 : 5;
      // Спицы шире к ободу, светлая грань со стороны света; у пяти лучей — шире и с кромкой.
      const base = style === 'six' ? 2.6 : 3.6;
      const grow = style === 'six' ? 1.8 : 3.2;
      const hw = ((base + (grow * (r - 13)) / (R - 13)) / r) * (180 / Math.PI);
      const d = spoke(a, angle, n);
      const px = (Math.abs(d) * Math.PI * r) / 180;
      const hwPx = (hw * Math.PI * r) / 180;
      if (Math.abs(d) < hw) {
        if (hwPx - px < 1) return gray(0.46); // кромка спицы
        if (style === 'five' && Math.abs(px) < 0.8 && r > 16) return gray(0.62); // ребро по оси
        return gray(d < -hw * 0.25 ? 1 : d > hw * 0.4 ? 0.62 : 0.84);
      }
      return null;
    }
    if (style === 'multi') {
      if (r < 12) return hub(r, a, 8);
      const hw = ((1.6 + (1 * (r - 12)) / (R - 12)) / r) * (180 / Math.PI);
      const d = spoke(a, angle, 10);
      if (Math.abs(d) < hw) return gray(d < 0 ? 1 : 0.78);
      return null;
    }
    if (style === 'mesh') {
      if (r < 12) return hub(r, a, 8);
      // Сетка: два семейства тонких спиц, закрученных в разные стороны, пересекаются ромбами.
      if (r > R - 7.5) return gray(0.66 + 0.2 * L); // плоская полка под болтами сборки
      const tw = 9 * ((r - 12) / (R - 12));
      const hw = (1.15 / r) * (180 / Math.PI);
      const d1 = spoke(a + tw * 1.6, angle, 10);
      const d2 = spoke(a - tw * 1.6, angle, 10);
      if (Math.abs(d1) < hw) return gray(0.92);
      if (Math.abs(d2) < hw) return gray(0.7);
      if (Math.abs(r - 15) < 1) return gray(0.6); // кольцо у ступицы
      return null;
    }
    const b = style === 'steelOld' ? 0.6 : 0.78;
    const win = toRay(a, angle, 8) * (Math.PI / 180) * r;
    if (Math.abs(r - R * 0.66) < 3.6 && win < 5) return null; // окно — видно тормоз
    if (Math.abs(r - R * 0.66) < 4.6 && win < 6) return gray(b - 0.22); // кромка окна
    if (Math.abs(r - R * 0.86) < 1.2) return gray(b - 0.12); // ребро у обода
    if (Math.abs(r - R * 0.44) < 1.4) return gray(b + 0.16); // ребро вокруг ступицы
    if (r < 11) {
      if (nut(r, a, 4, 7.4)) return gray(1);
      return r < 6 ? gray(b - 0.18) : gray(b - 0.08);
    }
    return gray(b + 0.1 * L);
  });
}

async function strip(makePix) {
  const frames = [];
  for (let i = 0; i < FRAMES; i++) frames.push(await makePix((i * 360) / FRAMES).png());
  return sharp({
    create: {
      width: FRAME * FRAMES,
      height: FRAME,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(frames.map((input, i) => ({ input, left: i * FRAME, top: 0 })))
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
  const { paint, base, tone } = drawBody(m);
  await save('car_shadow', await layerShadow(m).png());
  await save('car_wells', await layerWells(m).png());
  await save('car_base', await base.png());
  await save('car_paint', await paint.png());
  await save('car_tone', await tone.png());
  await save('car_headlight', await layerHeadlight(m).png());
  await save('car_dirt', await layerDirt(m).png());
  for (const k of ['rust', 'cage', 'light'])
    await save(`car_overlay_${k}`, await layerOverlay(k, m).png());
  await save('car_spoiler_lip_paint', await layerSpoiler('lip', 'paint', m).png());
  await save('car_spoiler_wing_paint', await layerSpoiler('wing', 'paint', m).png());
  await save('car_spoiler_wing_base', await layerSpoiler('wing', 'base', m).png());
  await save('car_bricks', await layerBricks().png());
  for (const [id, t] of Object.entries(TIRE_KINDS))
    for (const [size, r] of Object.entries(RIM_SIZE))
      await save(`wheel_tire_${id}_${size}`, await strip((a) => tirePix(t, r, a)));
  for (const [id, def] of Object.entries(RIMS)) {
    await save(`wheel_brake_${id}`, await strip((a) => brakePix(def, a)));
    await save(`wheel_rim_${id}`, await strip((a) => rimPix(def, id, a)));
  }

  const meta = {
    $comment:
      'Сгенерировано tools/build-car.mjs (npm run car) — не править руками. Координаты в единицах мира; текстуры в density раз крупнее. Рисунок — сетка 864×288 по чертежу R34 (точка = пиксель текстуры).',
    density: DENSITY,
    size: WORLD,
    anchor: { x: WORLD.width / 2, y: toWorldY(GROUND) },
    wheels: {
      rear: { x: toWorldX(AXR), y: toWorldY(AXY) },
      front: { x: toWorldX(AXF), y: toWorldY(AXY) },
      radius: +(TIRE_R / 3).toFixed(2),
    },
    wheelFrame: { width: FRAME / 3, height: FRAME / 3, frames: FRAMES },
    headlight: { x: toWorldX(820), y: toWorldY(165) },
    shadow: { height: SHADOW_H / 3, above: SHADOW_GROUND / 3 },
    // Шины: вид × размер диска; диски: размер. Детали ссылаются на них полем sprite.
    tires: Object.keys(TIRE_KINDS),
    rims: Object.fromEntries(Object.entries(RIMS).map(([id, d]) => [id, d.size])),
    noTires: { tire: 'old', rim: 'steelOld' },
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

/** Превью вариантов и собранный PNG 864×288 с прозрачным фоном. */
async function preview(files) {
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
  const frame = (buf, i = 0) =>
    sharp(buf)
      .extract({ left: i * FRAME, top: 0, width: FRAME, height: FRAME })
      .png()
      .toBuffer();
  const wheel = async (type, rim, rimHex, i) => [
    await frame(files[`wheel_brake_${rim}`], i),
    await frame(files[`wheel_tire_${type}_${RIMS[rim].size}`], i),
    await tint(await frame(files[`wheel_rim_${rim}`], i), rimHex),
  ];
  const assemble = async (v, bg) => {
    const layers = [];
    const add = (input, left = 0, top = 0) =>
      layers.push({ input, left: Math.round(left), top: Math.round(top) });
    add(files.car_wells);
    const pos = (x) => [Math.round(x - FRAME / 2), Math.round(AXY - FRAME / 2)];
    if (v.tire) {
      for (const x of [AXR, AXF])
        for (const b of await wheel(v.tire, v.rimStyle ?? 'six', v.rim, v.frame ?? 0))
          add(b, ...pos(x));
    } else {
      for (const b of await wheel('old', 'steelOld', '#9a9ea6', 0)) add(b, ...pos(AXR));
      add(files.car_bricks);
    }
    if (v.spoiler === 'wing') add(files.car_spoiler_wing_base);
    add(files.car_base);
    add(await tint(files.car_paint, v.paint));
    add(files.car_tone);
    if (v.overlay) add(files[`car_overlay_${v.overlay}`]);
    if (v.spoiler === 'lip') add(await tint(files.car_spoiler_lip_paint, v.paint));
    if (v.spoiler === 'wing') add(await tint(files.car_spoiler_wing_paint, v.paint));
    add(await tint(files.car_headlight, '#ffe8b0'));
    if (v.dirt) add(files.car_dirt);
    return sharp({ create: { width: W, height: H, channels: 4, background: bg } })
      .composite(layers)
      .png()
      .toBuffer();
  };
  const variants = [
    { paint: '#a8adb3', tire: null, overlay: 'rust', dirt: true },
    { paint: '#e8e8e0', tire: 'stock', rim: '#c0c4c8' },
    {
      paint: '#1f3f8f',
      tire: 'slicks',
      rimStyle: 'multi',
      overlay: 'light',
      rim: '#9a9ea6',
      spoiler: 'wing',
      frame: 3,
    },
    {
      paint: '#8b1a2b',
      tire: 'studded',
      rimStyle: 'steel',
      overlay: 'cage',
      rim: '#c0c4c8',
      spoiler: 'lip',
      frame: 6,
    },
    { paint: '#e0b022', tire: 'mud', rimStyle: 'mesh', overlay: 'rust', rim: '#c9a23a', frame: 2 },
    { paint: '#3a3d42', tire: 'sport', rimStyle: 'five', rim: '#1c1c1f', frame: 5 },
  ];
  const rows = [];
  for (const v of variants) rows.push(await assemble(v, '#2a2724'));
  mkdirSync(`${ROOT}art/preview`, { recursive: true });
  await sharp({ create: { width: W, height: H * rows.length, channels: 4, background: '#2a2724' } })
    .composite(rows.map((input, i) => ({ input, left: 0, top: i * H })))
    .png()
    .toFile(`${ROOT}art/preview/car.png`);
  const full = await assemble(
    { paint: '#a8adb3', tire: 'stock', rim: '#c0c4c8' },
    { r: 0, g: 0, b: 0, alpha: 0 },
  );
  await sharp(full).png().toFile(`${ROOT}art/preview/car-r34.png`);
  await sharp(full)
    .resize(W * 2, H * 2, { kernel: 'nearest' })
    .png()
    .toFile(`${ROOT}art/preview/car-r34-x2.png`);
  console.log('✓ превью art/preview/car.png, собранный art/preview/car-r34.png (864×288)');
}

await main();
