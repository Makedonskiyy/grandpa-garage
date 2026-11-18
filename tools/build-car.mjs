#!/usr/bin/env node
/**
 * build-car — машина игрока («дедова японка»): Nissan Skyline R34 GT-R купе, строго сбоку,
 * пиксель-арт на сетке 432×144 (1 точка = 11,27 мм). Марок и шильдиков нет (ТЗ 2.1).
 *
 * Геометрия не придумана, а снята с чертежей (docs/car/r34-technical-map.md):
 *   art/source/car/r34-silhouette.png — силуэт кузова (обычный GT-R, без крыла);
 *   art/source/car/r34-parts.png      — стёкла, рамки и тёмный пластик, крыло GT-R;
 *   координаты деталей ниже (фары, воздуховоды, швы, линии борта) — с того же чертежа.
 *
 * Как рисуется (по точкам, без сглаживания):
 *   1. Краска — серая шкала из 10 ступеней: свет сверху, светлое плечо под окнами, складка
 *      борта, тёмная полоса отражения горизонта, светлый порог; торцы темнее; контур — тёмной
 *      ступенью той же краски (selective outline). Игра перекрашивает слой умножением.
 *   2. Оттенки (hue shift) — отдельный слой поверх краски: холодный свет неба на верхних
 *      гранях, тёплый отсвет земли снизу, лиловый в глубоких тенях.
 *   3. Детали точками: швы с фаской, ручка, зеркало, фары, поворотники, воздуховоды, фонари.
 *   4. Колёса — 18″ на 245/40, шестиспицевые как на чертеже; 16 кадров вращения.
 *
 * Слои одного размера с общей привязкой (ТЗ 5.1), текстура = точка × 2.
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
const W = 432;
const H = 144;
const SCALE = 2; // точка = 2×2 пикселя текстуры: 864×288
const GEO = JSON.parse(readFileSync(`${SRC}r34-geometry.json`, 'utf8'));
const GROUND = GEO.grid.ground; // 138
const AXF = GEO.axles.front; // 337,15
const AXR = GEO.axles.rear; // 100,77
const AXY = GEO.axles.y; // 108,96
const TIRE_R = GEO.tireRadius; // 29,04 — 245/40 R18, Ø 655 мм
const ARCH_R = GEO.archRadius; // 30,96 — кромка арки
const RIM_R = 20.3; // 18″ = 457 мм
const FRAME = 72; // кадр колеса, точек
const FRAMES = 16;

// Мир игры: машина 288×96 единиц, кузов x 8…280. Точка сетки = 1/1,5 единицы.
const WORLD = { width: 288, height: 96 };
const toWorldX = (x) => +(8 + (x - 12) / 1.5).toFixed(2);
const toWorldY = (y) => +(y / 1.5).toFixed(2);
const DENSITY = (W * SCALE) / WORLD.width; // 3 пикселя текстуры на единицу мира

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
  chrome: '#9aa3ad',
  chromeHi: '#d8dee6',
  chromeLo: '#5c636d',
  lampBack: '#262a31',
  amber: '#e2892c',
  amberHi: '#ffc979',
  amberLo: '#a65a16',
  amberEdge: '#3a1e08',
  tail: '#a51d28',
  tailHi: '#ff7a7a',
  tailLo: '#5e0f15',
  tailEdge: '#300709',
  metal: '#7a7e86',
  metalHi: '#b8bcc4',
  metalDark: '#45484f',
  rubber: '#16171a',
  rubberSide: '#24252a',
  rubberLit: '#34363c',
  rubberHi: '#44474e',
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

  poly(points, hex, filter) {
    for (let i = 0; i < points.length - 1; i++)
      this.line(...points[i], ...points[i + 1], hex, filter);
  }

  png() {
    return sharp(Buffer.from(this.d), { raw: { width: this.w, height: this.h, channels: 4 } })
      .resize(this.w * SCALE, this.h * SCALE, { kernel: 'nearest' })
      .png()
      .toBuffer();
  }
}

class Mask {
  constructor(w, h, bits) {
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

  /** Оставить только связные куски не меньше min точек (убирает шум с чертежа). */
  keepBlobs(min) {
    const out = new Mask(this.w, this.h);
    const seen = new Uint8Array(this.w * this.h);
    for (let s = 0; s < this.bits.length; s++) {
      if (!this.bits[s] || seen[s]) continue;
      const blob = [];
      const st = [s];
      seen[s] = 1;
      while (st.length) {
        const i = st.pop();
        blob.push(i);
        const x = i % this.w;
        for (const j of [i - 1, i + 1, i - this.w, i + this.w]) {
          if (j < 0 || j >= this.bits.length || seen[j] || !this.bits[j]) continue;
          if ((j === i - 1 && x === 0) || (j === i + 1 && x === this.w - 1)) continue;
          seen[j] = 1;
          st.push(j);
        }
      }
      if (blob.length >= min) for (const i of blob) out.bits[i] = 1;
    }
    return out;
  }
}

/** Маска из многоугольника (точки сетки), точка внутри по центру. */
function polyMask(points) {
  const m = new Mask(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
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

/** Маска из строк [y, x0, x1]. */
function rowsMask(rows) {
  const m = new Mask(W, H);
  for (const [y, x0, x1] of rows) for (let x = x0; x <= x1; x++) m.put(x, y);
  return m;
}

function ellipseMask(cx, cy, rx, ry) {
  const m = new Mask(W, H);
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) m.put(x, y);
  return m;
}

async function loadMaps() {
  const read = async (file) => {
    const { data } = await sharp(`${SRC}${file}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return data;
  };
  const sil = await read('r34-silhouette.png');
  const parts = await read('r34-parts.png');
  const body = new Mask(W, H);
  const cls = {
    door: new Mask(W, H),
    quarter: new Mask(W, H),
    wind: new Mask(W, H),
    rear: new Mask(W, H),
    dark: new Mask(W, H),
    wing: new Mask(W, H),
  };
  const key = {
    '0,0,255': 'door',
    '0,255,255': 'quarter',
    '255,0,255': 'wind',
    '255,128,0': 'rear',
    '0,0,0': 'dark',
    '255,0,0': 'wing',
  };
  for (let i = 0; i < W * H; i++) {
    if (sil[i * 4 + 3] > 0) body.bits[i] = 1;
    if (parts[i * 4 + 3] === 0) continue;
    const k = key[`${parts[i * 4]},${parts[i * 4 + 1]},${parts[i * 4 + 2]}`];
    if (k) cls[k].bits[i] = 1;
  }
  return { body, ...cls };
}

// ---------- Детали по чертежу (координаты сетки) ----------

// Фара: клин под капотом, две секции (дальний свет спереди, ближний сзади).
const HEADLIGHT = [
  [382.2, 75.6],
  [395, 76.2],
  [408.2, 77.4],
  [410.6, 79.4],
  [410.8, 86.2],
  [409.6, 87.4],
  [384.2, 87.4],
  [382.4, 85],
  [381.8, 80],
];
const LAMP_REAR = { cx: 388.4, cy: 81.6, r: 3.6 };
const LAMP_FRONT = { cx: 401.2, cy: 82.2, r: 4.2 };
const TURN = [
  [401, 94],
  [406.8, 94],
  [406.8, 101.4],
  [401, 101.4],
];
const LOWER_VENT = [
  [399, 105.6],
  [403.2, 105.6],
  [403.4, 112.2],
  [399.6, 112.2],
];
const SIDE_DUCT = [
  [372.8, 98.2],
  [379, 99.4],
  [382.4, 115.4],
  [373.4, 115.4],
];
const SIDE_MARKER = [
  [291, 76],
  [297.4, 76],
  [297.4, 78.8],
  [291, 78.8],
];
const TAIL_UPPER = { cx: 23.2, cy: 57.6, rx: 2.4, ry: 4.6 };
const TAIL_LOWER = { cx: 21.8, cy: 66.6, rx: 2.4, ry: 4.8 };
// Зеркало: корпус в цвет кузова, строки [y, x0, x1].
const MIRROR = [
  [47, 249, 258],
  [48, 247, 260],
  [49, 246, 261],
  [50, 246, 262],
  [51, 246, 262],
  [52, 246, 262],
  [53, 246, 261],
  [54, 246, 261],
  [55, 247, 260],
  [56, 248, 259],
];
// Ручка двери (тяговая, у заднего края двери).
const HANDLE = { x0: 173, x1: 193, y: 63 };
// Дверь: задний край со скруглением внизу, низ, передний край.
const DOOR_REAR = [
  [165, 57],
  [164, 70],
  [164.4, 95],
  [166.6, 104],
  [171.6, 110],
  [180, 113],
];
const DOOR_BOTTOM = [
  [180, 113],
  [282, 113],
];
const DOOR_FRONT = [
  [282, 113],
  [284, 100],
  [285, 80],
  [283, 58],
];
const HOOD_SHUT = [
  [290, 55],
  [330, 57.2],
  [370, 63.4],
  [409, 75.2],
];
const BUMPER_TOP = [
  [372, 86.8],
  [413, 86.8],
];
const BUMPER_JOINT = [
  [396.7, 88],
  [396.7, 115.4],
];
const BUMPER_LOW = [
  [374, 114.6],
  [416, 114.6],
];
// Плечо: от фонаря полого вперёд, затем вниз к заднему краю двери (характерная линия R34).
const SHOULDER = [
  [27, 64.4],
  [60, 65.2],
  [90, 66],
  [111, 66.6],
  [140, 70.6],
  [164, 75],
];
const DOOR_LINE = [
  [146, 90.6],
  [220, 92.2],
  [296, 94],
];
const SKIRT_TOP = [
  [134, 103],
  [306, 103],
];
const SKIRT_CREASE = [
  [134, 111],
  [306, 111],
];
const REAR_BUMPER = [
  [32, 51.4],
  [32, 79],
  [36, 79.6],
  [56, 81.4],
  [75, 83.3],
];
const REAR_LOW = [
  [16, 101],
  [40, 105.2],
  [62, 110],
];
const TRUNK_SHUT = [
  [22, 52],
  [68, 52],
];
const DUCKTAIL = [
  [21, 50.4],
  [22.6, 47.4],
  [38, 47],
  [48, 48.6],
  [50, 50.6],
];

const dist = (x, y, cx) => Math.hypot(x + 0.5 - cx, y + 0.5 - AXY);

// ---------- Кузов ----------

async function bodyMasks() {
  const m = await loadMaps();
  m.dark = m.dark.keepBlobs(12);
  // Губа V-spec и углеродный диффузор — у обычного GT-R тоньше: тёмным оставляем только низ.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!m.dark.bits[i]) continue;
      if (x > 340 && y < 121) m.dark.bits[i] = 0;
      if (x < 75 && y < 116) m.dark.bits[i] = 0;
      if (x > 100 && x < 340 && y > 100) m.dark.bits[i] = 0; // шум по порогу
    }
  // Одиночные точки «краски» внутри рамок окон — шум чертежа: если вокруг почти одно
  // стекло и рамка, точка становится рамкой (два прохода).
  const glassy = (x, y) =>
    m.door.at(x, y) || m.quarter.at(x, y) || m.wind.at(x, y) || m.rear.at(x, y) || m.dark.at(x, y);
  for (let pass = 0; pass < 2; pass++)
    for (let y = 14; y < 64; y++)
      for (let x = 60; x < 320; x++) {
        if (!m.body.at(x, y) || glassy(x, y)) continue;
        let n = 0;
        for (let j = -1; j <= 1; j++)
          for (let i = -1; i <= 1; i++) if ((i || j) && glassy(x + i, y + j)) n++;
        if (n >= 5) m.dark.put(x, y);
      }
  m.side = m.door.or(m.quarter);
  m.glass = m.side.or(m.wind, m.rear);
  m.head = polyMask(HEADLIGHT);
  m.turn = polyMask(TURN);
  m.vent = polyMask(LOWER_VENT);
  m.duct = polyMask(SIDE_DUCT);
  m.marker = polyMask(SIDE_MARKER);
  m.tail = ellipseMask(TAIL_UPPER.cx, TAIL_UPPER.cy, TAIL_UPPER.rx, TAIL_UPPER.ry).or(
    ellipseMask(TAIL_LOWER.cx, TAIL_LOWER.cy, TAIL_LOWER.rx, TAIL_LOWER.ry),
  );
  m.mirror = rowsMask(MIRROR);
  m.trim = m.dark.or(m.head, m.turn, m.vent, m.duct, m.marker, m.tail);
  // Капот — для карбона: всё выше линии капота спереди от лобового.
  m.hood = new Mask(W, H);
  for (let x = 290; x < 412; x++) {
    const yl = along(HOOD_SHUT, x) ?? 76;
    for (let y = 0; y < yl; y++) if (m.body.at(x, y) && !m.glass.at(x, y)) m.hood.put(x, y);
  }
  m.paint = m.body.minus(m.glass, m.trim);
  return m;
}

/** Верхняя кромка кузова в каждом столбце. */
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

/** y ломаной на заданном x (null — вне её). */
function along(points, x) {
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    if ((x >= ax && x <= bx) || (x <= ax && x >= bx))
      return ay + ((by - ay) * (x - ax)) / (bx - ax || 1);
  }
  return null;
}

/** Тон краски: полосы света по высоте, плечо, отражение горизонта, порог, торцы. */
function paintTone(x, y, top) {
  const sh = along(SHOULDER, x);
  const dl = along(DOOR_LINE, x);
  let v;
  if (y < 47)
    v = G.lit; // стойки, крыша, багажник
  else if (y < 62 || (sh !== null && y < sh))
    v = G.lit; // плечо под окнами — светлое
  else if (y < 72) v = G.side;
  else if (y < 84) v = G.side;
  else if (y < 92) v = G.mid;
  else if (y < 103) v = G.low;
  else if (y < 108)
    v = G.up; // порог выпуклый — ловит свет
  else if (y < 114) v = G.mid;
  else v = G.dark;
  // Под плечом — тёмная полоса отражения горизонта (3 точки), затем светлее.
  if (sh !== null && y > sh && y <= sh + 3) v = G.low;
  else if (sh === null && y >= 62 && y <= 64 && x > 164) v = G.mid;
  // Под линией двери — тень складки.
  if (dl !== null && y > dl && y <= dl + 2) v = G.dark;
  // Верхние грани (крыша, капот, багажник) ловят небо.
  if (top[x] >= 0 && y - top[x] <= 2 && y < 80) v = G.hi;
  else if (top[x] >= 0 && y - top[x] <= 5 && y < 60) v = Math.max(v, G.lit);
  // Капот у лобового светлее, к фаре темнее — поверхность наклоняется вниз.
  if (x > 290 && y < 64 && y - top[x] > 2) v = x > 380 ? G.up : G.lit;
  // Торцы скругляются — темнее.
  if (x < 17) v -= 0.14;
  else if (x < 24) v -= 0.07;
  if (x > 414) v -= 0.14;
  else if (x > 408) v -= 0.07;
  return v;
}

/** Ближайшая ступень палитры — без промежуточных «грязных» тонов. */
const STEPS = Object.values(G).sort((a, b) => a - b);
const snap = (v) =>
  STEPS.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best), STEPS[0]);

function drawBody(m) {
  const paint = new Pix();
  const base = new Pix();
  const tone = new Pix();
  const top = topEdge(m);
  const inPaint = (x, y) => m.paint.at(x, y) && !m.body.edge(x, y);
  const P = (v) => gray(v);
  /** Шов с фаской: тёмная щель и светлая кромка рядом (сдвиг dx, dy). */
  const bevel = (points, dx, dy, dark = G.seam, light = G.hi) => {
    paint.poly(points, P(dark), inPaint);
    if (light !== null)
      paint.poly(
        points.map(([x, y]) => [x + dx, y + dy]),
        P(light),
        inPaint,
      );
  };

  // 1. Тон краски.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (inPaint(x, y)) paint.set(x, y, P(snap(paintTone(x, y, top))));
  // Дизеринг только на одном широком переходе — середина двери (светлое → среднее).
  for (let x = 0; x < W; x++)
    if (inPaint(x, 84) && (x & 1) === 0 && paintTone(x, 83, top) > paintTone(x, 84, top))
      paint.set(x, 84, P(G.side));

  // 2. Блик под окнами: первая точка краски под стеклом и рамкой.
  for (let y = 1; y < 64; y++)
    for (let x = 0; x < W; x++)
      if (inPaint(x, y) && (m.glass.at(x, y - 1) || m.dark.at(x, y - 1))) paint.set(x, y, P(G.hi));

  // 3. Арки: тень по краю ниши, блик кромки, расширитель GT-R.
  for (const cx of [AXR, AXF])
    for (let y = 0; y < H; y++)
      for (let x = Math.floor(cx - ARCH_R - 8); x <= cx + ARCH_R + 8; x++) {
        if (!inPaint(x, y)) continue;
        const d = dist(x, y, cx);
        const upper = y < AXY + 4;
        if (d < ARCH_R + 1.1) paint.set(x, y, P(G.dark));
        else if (d < ARCH_R + 2.1 && upper) paint.set(x, y, P(G.hi));
        else if (d < ARCH_R + 5 && upper && y > 62) paint.set(x, y, P(G.up));
        else if (d < ARCH_R + 6 && upper && y > 62) paint.set(x, y, P(G.mid));
      }

  // 4. Линии борта: плечо, линия двери, порог.
  bevel(SHOULDER, 0, -1, G.dark, G.hi);
  bevel(DOOR_LINE, 0, -1, G.dark, G.lit);
  bevel(SKIRT_TOP, 0, 1, G.seam, G.lit);
  bevel(SKIRT_CREASE, 0, 1, G.dark, G.mid);

  // 5. Швы панелей.
  bevel(DOOR_REAR, 1, 0);
  bevel(DOOR_BOTTOM, 0, -1, G.seam, null);
  bevel(DOOR_FRONT, -1, 0);
  bevel(HOOD_SHUT, 0, 1, G.seam, G.hi);
  bevel(BUMPER_TOP, 0, 1, G.seam, G.lit);
  bevel(BUMPER_JOINT, 1, 0, G.seam, G.up);
  bevel(BUMPER_LOW, 0, 1, G.dark, G.side);
  bevel(REAR_BUMPER, 1, 1, G.seam, G.up);
  bevel(REAR_LOW, 0, 1, G.dark, G.side);
  bevel(TRUNK_SHUT, 0, 1, G.seam, G.lit);

  // 6. Ручка двери: углубление, ручка, личинка замка.
  const { x0, x1, y: hy } = HANDLE;
  paint.line(x0 + 1, hy, x1 - 1, hy, P(G.deep), inPaint);
  paint.line(x0, hy + 1, x1, hy + 1, P(G.hi), inPaint);
  paint.line(x0, hy + 2, x1, hy + 2, P(G.up), inPaint);
  paint.line(x0 + 1, hy + 3, x1 - 1, hy + 3, P(G.dark), inPaint);
  paint.set(x0, hy + 1, P(G.dark));
  paint.set(x1, hy + 1, P(G.dark));
  paint.set(x1 - 2, hy + 1, P(G.seam));
  paint.set(x1 - 2, hy + 2, P(G.seam));

  // 7. Основа: стёкла, рамки, оптика, пластик.
  drawGlass(base, m);
  drawLights(base, m);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (m.dark.at(x, y)) base.set(x, y, y > 110 ? C.trim : C.frame);
      if (m.vent.at(x, y)) base.set(x, y, y % 2 ? C.trim : C.trimHi);
      if (m.duct.at(x, y)) base.set(x, y, (y - 98) % 4 === 0 ? C.trimHi : C.trim);
    }
  // Глянец чёрной стойки B: вертикальный блик.
  for (let y = 26; y < 56; y++)
    for (const x of [174, 175]) if (m.dark.at(x, y)) base.set(x, y, C.frameHi);
  // Чёрный низ: верхняя кромка чуть светлее.
  for (let x = 0; x < W; x++)
    for (let y = 100; y < H; y++)
      if (m.dark.at(x, y) && !m.dark.at(x, y - 1)) base.set(x, y, C.trimHi);

  // 8. Контур: кузов — тёмной ступенью краски (selective outline), снизу и у пластика — чёрный.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!m.body.edge(x, y)) continue;
      base.set(x, y, C.outline);
      if (m.paint.at(x, y) && y < 112) paint.set(x, y, P(G.out));
      else paint.clear(x, y);
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (m.side.edge(x, y) && !m.dark.at(x, y)) base.set(x, y, C.frame);

  drawMirror(paint, base, m);
  drawTone(tone, paint, m, top);
  return { paint, base, tone };
}

/** Зеркало: корпус в цвет кузова — светлый верх, тень снизу, тёмный контур и ножка. */
function drawMirror(paint, base, m) {
  for (let y = 0; y < H; y++)
    for (let x = 240; x < 268; x++) {
      if (!m.mirror.at(x, y)) continue;
      base.set(x, y, C.outline);
      if (m.mirror.edge(x, y)) {
        paint.set(x, y, gray(G.out));
        continue;
      }
      const v = !m.mirror.at(x, y - 2)
        ? G.hi
        : !m.mirror.at(x, y + 2)
          ? G.mid
          : x > 258
            ? G.side
            : G.lit;
      paint.set(x, y, gray(v));
    }
  paint.set(250, 49, gray(G.hi));
  base.rect(251, 57, 4, 2, C.trim);
  base.rect(251, 57, 4, 1, C.trimHi);
}

function drawGlass(base, m) {
  const side = (y) =>
    y <= 30 ? C.glassTop : y <= 36 ? C.glassMid : y <= 48 ? C.glassLow : C.glassDeep;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (m.side.at(x, y)) base.set(x, y, side(y));
      if (m.wind.at(x, y)) base.set(x, y, m.wind.at(x - 1, y - 1) ? C.windLow : C.windTop);
      if (m.rear.at(x, y)) base.set(x, y, m.rear.at(x, y - 1) ? C.glassMid : C.windTop);
    }
  // Отражение неба — косые полосы на дверном стекле и форточке.
  const onDoor = (x, y) => m.door.at(x, y) && !m.door.edge(x, y);
  const onQuarter = (x, y) => m.quarter.at(x, y) && !m.quarter.edge(x, y);
  for (const [x0, w] of [
    [214, 3],
    [221, 1],
  ])
    for (let k = 0; k < w; k++) base.line(x0 + k, 27, x0 + k - 16, 58, C.glassStreak, onDoor);
  base.line(146, 30, 138, 47, C.glassStreak, onQuarter);
  base.line(147, 30, 139, 47, C.glassStreak, onQuarter);
  // Сиденье в салоне: подголовник и спинка — тёмный силуэт.
  for (let y = 34; y < 60; y++)
    for (let x = 184; x <= 199; x++) {
      const head = y <= 41 && Math.hypot(x - 191, y - 37.5) <= 4;
      const back = y > 41 && x >= 186 && x <= 198 - Math.max(0, (y - 50) * 0.3);
      if ((head || back) && onDoor(x, y)) base.set(x, y, C.glassDeep);
    }
  for (const [x, y] of [
    [232, 29],
    [233, 29],
    [150, 30],
  ])
    if (m.side.at(x, y)) base.set(x, y, C.glassShine);
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

function drawLights(base, m) {
  // Фара: рамка, тёмный корпус, хромовые отражатели двух секций, стекло с бликом по верху.
  for (let y = 0; y < H; y++)
    for (let x = 370; x < W; x++) {
      if (!m.head.at(x, y)) continue;
      let c = m.head.edge(x, y) ? C.outline : C.lampBack;
      if (!m.head.edge(x, y) && !m.head.at(x, y - 2)) c = C.chromeHi;
      for (const L of [LAMP_REAR, LAMP_FRONT]) {
        const d = Math.hypot(x + 0.5 - L.cx, y + 0.5 - L.cy);
        if (d <= L.r + 1.2 && d > L.r) c = C.chromeLo;
        else if (d <= L.r && d > L.r - 1.2) c = C.chrome;
        else if (d <= L.r - 1.2) c = x + y < L.cx + L.cy - 1 ? C.chromeHi : C.chrome;
      }
      if (!m.head.edge(x, y) && Math.abs(x + 0.5 - 394.6) < 0.6) c = C.chromeLo; // перегородка
      base.set(x, y, c);
    }
  paintLens(base, m.turn, C.amberEdge, C.amber, C.amberHi, C.amberLo);
  paintLens(base, m.marker, C.amberEdge, C.amber, C.amberHi, C.amberLo);
  // Задние фонари: два круглых, в профиль — овалы с кольцами.
  for (const L of [TAIL_UPPER, TAIL_LOWER]) {
    const e = ellipseMask(L.cx, L.cy, L.rx, L.ry);
    for (let y = 0; y < H; y++)
      for (let x = 10; x < 34; x++) {
        if (!e.at(x, y)) continue;
        const k = Math.hypot((x + 0.5 - L.cx) / L.rx, (y + 0.5 - L.cy) / L.ry);
        let c = e.edge(x, y) ? C.tailEdge : k > 0.6 ? C.tail : k > 0.35 ? C.tailLo : '#c42630';
        if (!e.edge(x, y) && y + 0.5 < L.cy - L.ry * 0.45 && x + 0.5 < L.cx + 0.6) c = C.tailHi;
        base.set(x, y, c);
      }
  }
}

/**
 * Оттенки поверх краски (hue shift): блики уходят в холодный цвет неба, тени — в лиловый,
 * низ — в тёплый отсвет земли. Полупрозрачно, поэтому работает с любым цветом кузова.
 */
function drawTone(tone, paint, m, top) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!paint.has(x, y) || !m.paint.at(x, y) || m.body.edge(x, y)) continue;
      const v = paint.d[(y * W + x) * 4] / 255;
      if (v >= 0.99 && y < 80) tone.set(x, y, '#c8dcff', 70);
      else if (v >= 0.92 && y - top[x] < 8) tone.set(x, y, '#b8ccef', 40);
      else if (v <= 0.5) tone.set(x, y, '#2a1840', 60);
      else if (y > 100) tone.set(x, y, '#6b4a2e', 34);
    }
}

function layerHeadlight() {
  // Светящиеся центры проекторов — их цвет задаёт «Внешний вид → Фары».
  const p = new Pix();
  for (const L of [LAMP_REAR, LAMP_FRONT])
    for (let y = Math.floor(L.cy - L.r); y <= L.cy + L.r; y++)
      for (let x = Math.floor(L.cx - L.r); x <= L.cx + L.r; x++) {
        const d = Math.hypot(x + 0.5 - L.cx, y + 0.5 - L.cy);
        if (d <= L.r - 1.6) p.set(x, y, gray(d < 1 ? 1 : 0.86));
      }
  return p;
}

function layerWells(m) {
  const p = new Pix();
  for (const cx of [AXR, AXF])
    for (let y = 0; y < GROUND; y++)
      for (let x = Math.floor(cx - ARCH_R - 1); x <= cx + ARCH_R + 1; x++) {
        const d = dist(x, y, cx);
        if (d < ARCH_R + 0.6 && !m.body.at(x, y))
          p.set(x, y, d > ARCH_R - 3 && y < AXY ? C.wellHi : C.well);
      }
  return p;
}

function layerDirt(m) {
  const r = rng(7);
  const p = new Pix();
  const browns = ['#5b4a37', '#6e5a42', '#7d6a50', '#4a3d2e'];
  for (let y = 60; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!m.paint.at(x, y)) continue;
      const k = ((y - 60) / 62) ** 1.6 * 0.5;
      const nearArch = Math.min(dist(x, y, AXR), dist(x, y, AXF)) < ARCH_R + 7;
      if (r() < k + (nearArch ? 0.22 : 0)) p.set(x, y, browns[Math.floor(r() * 4)]);
    }
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(18 + r() * 390);
    const y0 = Math.floor(64 + r() * 12);
    const len = Math.floor(4 + r() * 14);
    for (let y = y0; y < y0 + len; y++) if (m.paint.at(x, y)) p.set(x, y, '#6e5a42');
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (m.glass.at(x, y) && r() < 0.12) p.set(x, y, r() < 0.5 ? '#8d8a80' : '#a39f94');
  return p;
}

function layerOverlay(kind, m) {
  const p = new Pix();
  if (kind === 'rust') {
    const r = rng(21);
    const rust = ['#7a3a1c', '#93481f', '#b25b26', '#5c2c16', '#c56a2c'];
    const zones = [
      [AXR - 40, 98, 16, 22],
      [AXR + 26, 100, 14, 18],
      [AXF - 40, 100, 14, 16],
      [AXF + 26, 96, 14, 20],
      [140, 104, 150, 10],
      [14, 70, 12, 26],
      [360, 60, 20, 6],
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
    // Каркас безопасности виден в стёклах: стойка у лобового, дверная распорка, диагональ.
    const on = (x, y) => m.side.at(x, y) && !m.side.edge(x, y);
    const bar = (a, b) => {
      p.line(...a, ...b, C.metal, on);
      p.line(a[0] + 1, a[1], b[0] + 1, b[1], C.metalHi, on);
    };
    bar([240, 30], [266, 56]);
    bar([178, 34], [268, 34]);
    bar([120, 52], [160, 28]);
    p.rect(410, 116, 3, 4, '#d14b2a'); // буксировочная петля
    return p;
  }
  if (kind === 'light') {
    // Карбоновый капот и тонированная форточка.
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (m.hood.at(x, y) && m.paint.at(x, y) && !m.body.edge(x, y))
          p.set(x, y, (x + y) % 2 ? '#24252a' : (x >> 1) % 2 ? '#34363c' : '#2c2e33');
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
      else if (!mk.at(x, y - 2)) p.set(x, y, gray(G.hi));
      else if (!mk.at(x, y + 2)) p.set(x, y, gray(v - 0.24));
      else p.set(x, y, gray(v));
    }
}

function layerSpoiler(kind, part, m) {
  const p = new Pix();
  if (kind === 'lip') {
    if (part === 'paint') shadeShape(p, polyMask(DUCKTAIL), 0.84);
    return p;
  }
  // Штатное крыло GT-R — прямо с чертежа (класс wing в карте деталей).
  if (part === 'base') {
    for (let x = 22; x < 50; x++) p.set(x, 51, '#000000', 90);
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
  // Голая ступица: тормозной диск с перфорацией, шпильки, суппорт.
  for (let y = Math.floor(cy - 19); y <= cy + 19; y++)
    for (let x = Math.floor(cx - 19); x <= cx + 19; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const a = (Math.atan2(y + 0.5 - cy, x + 0.5 - cx) * 180) / Math.PI + 360;
      if (d > 18.4) continue;
      let c = d > 17.2 ? C.discDark : d > 15 ? C.discHi : C.disc;
      if (d < 9) c = C.metalDark;
      if (d < 6.4) c = C.metal;
      if (Math.abs(d - 12.5) < 0.8 && Math.abs((a % 24) - 12) > 8) c = C.discDark;
      if (Math.abs(d - 4.2) < 0.9 && Math.abs((a % 72) - 36) > 26) c = C.metalHi;
      p.set(x, y, c);
    }
  for (let y = Math.floor(cy - 10); y <= cy + 9; y++)
    for (let x = Math.floor(cx - 23); x <= cx - 16; x++)
      p.set(x, y, x <= cx - 22 ? C.metal : C.caliperGrey);
  // Два ряда кирпичей со сдвигом швов.
  const bx = Math.round(cx - 21);
  const row = (y, offset) => {
    p.rect(bx, y, 42, 12, C.brick);
    p.rect(bx, y, 42, 2, C.brickHi);
    p.rect(bx, y + 10, 42, 1, C.brickDark);
    p.rect(bx, y + 11, 42, 1, C.mortar);
    for (let k = bx + (offset ? 6 : 13); k < bx + 42; k += 14) p.rect(k, y, 1, 11, C.mortar);
    for (let yy = y; yy < y + 12; yy++) {
      p.set(bx, yy, C.brickDark);
      p.set(bx + 41, yy, C.brickDark);
    }
  };
  row(GROUND - 24, false);
  row(GROUND - 12, true);
  return p;
}

// ---------- Колёса: шина + тормоз (не перекрашиваются) и диск (серый) ----------

const TIRES = {
  stock: { rim: RIM_R, style: 'six', caliper: C.caliperGrey },
  studded: { rim: 18, style: 'steel', caliper: C.caliperGrey, studs: true },
  slicks: { rim: RIM_R, style: 'multi', caliper: C.caliperRed },
  old: { rim: 18, style: 'steelOld', caliper: C.caliperGrey, flat: true },
};

const angDist = (a, b) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);
const toRay = (a, start, n) => {
  const step = 360 / n;
  return angDist(a, start + Math.round((a - start) / step) * step);
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

function tirePix(t, angle) {
  const R = TIRE_R;
  return polar((rr, a, dx, dy) => {
    // Спущенное колесо: нижняя половина шины расплющена и раздута в стороны.
    const r = t.flat && dy > 0 && rr > t.rim ? Math.hypot((dx * R) / (R + 3), dy) : rr;
    if (r > R) return null;
    if (r > R - 1) return C.outline;
    if (r > t.rim + 1) {
      if (t.studs && r > R - 2.4 && toRay(a, angle, 36) < 2) return '#cfd4dc';
      const L = lit(a);
      // Боковина: светлее сверху слева, ступенями; кольцо борта у обода.
      if (r < t.rim + 2) return C.rubber;
      if (Math.abs(r - (R - 3)) < 0.5 && L > 0.3) return C.rubberHi;
      return L > 0.7 ? C.rubberLit : L > 0.25 ? C.rubberSide : C.rubber;
    }
    if (r > t.rim) return C.outline;
    // За диском: неподвижный суппорт сзади сверху и тормозной диск с перфорацией.
    const ca = angDist(a, 205);
    if (ca < 22 && r > t.rim - 7.5 && r < t.rim - 1.5) {
      if (r > t.rim - 3) return t.caliper === C.caliperRed ? C.caliperRedHi : C.caliperGreyHi;
      return t.caliper;
    }
    if (r > t.rim - 1.5) return C.discDark;
    if (Math.abs(r - (t.rim - 4.6)) < 0.6 && toRay(a, angle, 18) < 4) return C.discDark;
    if (r < 5) return C.discDark;
    return r > t.rim - 6 ? C.discHi : C.disc;
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
      if (d < 1.1) return true;
    }
    return false;
  };
  const spoke = (a, n) => {
    const step = 360 / n;
    const k = Math.round((a - angle) / step);
    return ((((a - (angle + k * step)) % 360) + 540) % 360) - 180;
  };
  return polar((r, a) => {
    if (r > R) return null;
    const L = lit(a);
    // Обод: полированная полка, светлая сверху слева; внутренняя ступень темнее.
    if (r > R - 1.4) return gray(0.72 + 0.28 * L);
    if (r > R - 2.4) return gray(0.5);
    if (t.style === 'six') {
      if (r < 6.6) {
        if (nut(r, a, 5, 4.4)) return gray(0.42);
        return r < 2.6 ? gray(0.55) : r > 5.6 ? gray(0.6) : gray(0.86);
      }
      // Шесть спиц, как на чертеже: шире к ободу, светлая грань со стороны света.
      const hw = ((1.5 + (1.4 * (r - 6.6)) / (R - 6.6)) / r) * (180 / Math.PI);
      const d = spoke(a, 6);
      if (Math.abs(d) < hw) return gray(d < -hw * 0.3 ? 1 : d > hw * 0.45 ? 0.6 : 0.84);
      return null;
    }
    if (t.style === 'multi') {
      if (r < 6) {
        if (nut(r, a, 5, 4)) return gray(0.42);
        return r < 2.4 ? gray(0.55) : gray(0.86);
      }
      const hw = ((0.8 + (0.5 * (r - 6)) / (R - 6)) / r) * (180 / Math.PI);
      const d = spoke(a, 10);
      if (Math.abs(d) < hw) return gray(d < 0 ? 1 : 0.78);
      return null;
    }
    // Штампованный стальной: сплошной диск, 8 овальных отверстий, кольцо и гайки.
    const b = t.style === 'steelOld' ? 0.62 : 0.8;
    if (Math.abs(r - R * 0.62) < 1.6 && toRay(a, angle, 8) * (Math.PI / 180) * r < 2.6) return null;
    if (Math.abs(r - R * 0.42) < 0.6) return gray(b + 0.15);
    if (r < 5) return nut(r, a, 5, 3.4) ? gray(1) : gray(b - 0.15);
    return gray(b + 0.08 * L);
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
  const { paint, base, tone } = drawBody(m);
  await save('car_wells', await layerWells(m).png());
  await save('car_base', await base.png());
  await save('car_paint', await paint.png());
  await save('car_tone', await tone.png());
  await save('car_headlight', await layerHeadlight().png());
  await save('car_dirt', await layerDirt(m).png());
  for (const k of ['rust', 'cage', 'light'])
    await save(`car_overlay_${k}`, await layerOverlay(k, m).png());
  await save('car_spoiler_lip_paint', await layerSpoiler('lip', 'paint', m).png());
  await save('car_spoiler_wing_paint', await layerSpoiler('wing', 'paint', m).png());
  await save('car_spoiler_wing_base', await layerSpoiler('wing', 'base', m).png());
  await save('car_bricks', await layerBricks().png());
  for (const [id, t] of Object.entries(TIRES)) {
    await save(`wheel_tire_${id}`, await strip((a) => tirePix(t, a)));
    await save(`wheel_rim_${id}`, await strip((a) => rimPix(t, a)));
  }

  const meta = {
    $comment:
      'Сгенерировано tools/build-car.mjs (npm run car) — не править руками. Координаты в единицах мира; текстуры в density раз крупнее. Рисунок — сетка 432×144 (точка = 2×2 пикселя текстуры).',
    density: DENSITY,
    size: WORLD,
    anchor: { x: WORLD.width / 2, y: toWorldY(GROUND) },
    wheels: {
      rear: { x: toWorldX(AXR), y: toWorldY(AXY) },
      front: { x: toWorldX(AXF), y: toWorldY(AXY) },
      radius: +(TIRE_R / 1.5).toFixed(2),
    },
    wheelFrame: { width: FRAME / 1.5, height: FRAME / 1.5, frames: FRAMES },
    headlight: { x: toWorldX(411), y: toWorldY(81) },
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

/** Превью вариантов и собранный PNG 432×144 с прозрачным фоном. */
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
  const assemble = async (v, bg) => {
    const layers = [];
    const add = (input, left = 0, top = 0) =>
      layers.push({ input, left: Math.round(left), top: Math.round(top) });
    add(files.car_wells);
    const pos = (x) => [Math.round(x - FRAME / 2) * D, Math.round(AXY - FRAME / 2) * D];
    if (v.tire) {
      for (const x of [AXR, AXF])
        for (const b of await wheel(v.tire, v.rim, v.frame ?? 0)) add(b, ...pos(x));
    } else {
      for (const b of await wheel('old', '#9a9ea6', 0)) add(b, ...pos(AXR));
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
    return sharp({ create: { width: W * D, height: H * D, channels: 4, background: bg } })
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
      overlay: 'light',
      rim: '#9a9ea6',
      spoiler: 'wing',
      frame: 3,
    },
    {
      paint: '#8b1a2b',
      tire: 'studded',
      overlay: 'cage',
      rim: '#c0c4c8',
      spoiler: 'lip',
      frame: 6,
    },
  ];
  const rows = [];
  for (const v of variants) rows.push(await assemble(v, '#2a2724'));
  mkdirSync(`${ROOT}art/preview`, { recursive: true });
  await sharp({
    create: { width: W * D, height: H * D * rows.length, channels: 4, background: '#2a2724' },
  })
    .composite(rows.map((input, i) => ({ input, left: 0, top: i * H * D })))
    .png()
    .toFile(`${ROOT}art/preview/car.png`);
  // Собранный PNG: серебристая машина на родных дисках, 432×144, прозрачный фон.
  const full = await assemble(
    { paint: '#a8adb3', tire: 'stock', rim: '#c0c4c8' },
    { r: 0, g: 0, b: 0, alpha: 0 },
  );
  await sharp(full)
    .resize(W, H, { kernel: 'nearest' })
    .png()
    .toFile(`${ROOT}art/preview/car-r34.png`);
  await sharp(full)
    .resize(W * 4, H * 4, { kernel: 'nearest' })
    .png()
    .toFile(`${ROOT}art/preview/car-r34-x4.png`);
  console.log('✓ превью art/preview/car.png, собранный art/preview/car-r34.png (432×144)');
}

await main();
