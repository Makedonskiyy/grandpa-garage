#!/usr/bin/env node
/**
 * trace-car — переносит вид сбоку с чертежа R34 (чертеж.jpg в корне проекта, в git не входит)
 * на сетку машины 864×288 и сохраняет карты в art/source/car/:
 *   r34-silhouette.png — кузов (обычный GT-R: без крыла и губы V-spec, арки вырезаны);
 *   r34-parts.png      — стёкла, тёмный пластик и рамки, фара, повторитель, крыло;
 *   r34-lines.png      — линии чертежа на кузове: швы, складки, вырезы, ручка, зеркало;
 *   r34-geometry.json  — оси, колёса, масштаб и контрольные размеры.
 * По ним рисует tools/build-car.mjs — сам чертёж для сборки игры не нужен.
 *
 * Масштаб — по колёсной базе 2665 мм (центры колёс на чертеже x = 751 и 1333 px).
 * Сетка: кузов 4600 мм = 816 точек (x 24…840, машина смотрит вправо), земля y = 276,
 * 1 точка = 5,64 мм. Подробно — docs/car/r34-technical-map.md.
 *
 *   node tools/trace-car.mjs
 */
import sharp from 'sharp';
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = `${ROOT}чертеж.jpg`;
const OUT = `${ROOT}art/source/car/`;
if (!existsSync(SRC)) throw new Error('Нужен чертеж.jpg в корне проекта');

// Чертёж (пиксели исходника): оси, земля, перёд кузова.
const AXLE_F = 751;
const AXLE_R = 1333;
const AXLE_Y = 257.5;
const GROUND_BP = 329;
const FRONT_BP = 547;
const MM_BP = 2665 / (AXLE_R - AXLE_F); // 4,579 мм на пиксель чертежа

// Сетка игры.
const W = 864;
const H = 288;
const X_FRONT = 840;
const GROUND = 276;
const MM = 4600 / 816; // 5,637 мм на точку
const K = MM / MM_BP; // пикселей чертежа на точку
const toBp = (x, y) => [FRONT_BP + (X_FRONT - x) * K, GROUND_BP - (GROUND - y) * K];
const mmFront = (x) => (X_FRONT - x - 0.5) * MM;
const height = (y) => (GROUND - y - 0.5) * MM;

const AXF = X_FRONT - (AXLE_F - FRONT_BP) / K;
const AXR = X_FRONT - (AXLE_R - FRONT_BP) / K;
const AXY = GROUND - (GROUND_BP - AXLE_Y) / K;
const TIRE_R = (GROUND_BP - AXLE_Y) / K; // шина Ø 655 мм
const RIM_R = (57 * MM_BP) / MM; // видимый обод Ø 522 мм — по чертежу
const ARCH_R = (AXLE_Y - 182) / K + 0.6; // кромка арки

// Фара по чертежу (сетка 864): скруглённый задний угол, верх по капоту, скошенный перёд.
const HEADLIGHT = [
  [769, 149.6],
  [776, 150.6],
  [790, 152.6],
  [804, 154.6],
  [811.4, 155.8],
  [813.6, 158.4],
  [818.8, 173.4],
  [771.2, 173],
  [767, 163],
  [765.2, 157],
  [766.4, 152],
];
// Зеркало: на чертеже его контур лежит внутри дверного стекла — задаём строками.
const MIRROR = [
  [94, 498, 516],
  [95, 495, 520],
  [96, 493, 522],
  [97, 492, 524],
  [98, 492, 524],
  [99, 492, 524],
  [100, 492, 524],
  [101, 492, 524],
  [102, 492, 524],
  [103, 492, 523],
  [104, 492, 523],
  [105, 492, 522],
  [106, 492, 522],
  [107, 492, 521],
  [108, 493, 521],
  [109, 494, 520],
  [110, 495, 519],
  [111, 496, 518],
  [112, 498, 516],
];

const { data: BP, info } = await sharp(SRC).greyscale().raw().toBuffer({ resolveWithObject: true });
const BW = info.width;
const BH = info.height;
const bpv = (x, y) => {
  const xi = Math.round(x);
  const yi = Math.round(y);
  return xi < 0 || yi < 0 || xi >= BW || yi >= BH ? 255 : BP[yi * BW + xi];
};

/** Заливка светлой области чертежа от точки (граница — линии темнее порога). */
function flood(seeds, thr, box = [520, 0, 1600, 340]) {
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0;
  const h = y1 - y0;
  const out = new Uint8Array(w * h);
  const st = [];
  for (const [x, y] of seeds) st.push(x - x0, y - y0);
  while (st.length) {
    const y = st.pop();
    const x = st.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = y * w + x;
    if (out[i] || BP[(y + y0) * BW + x + x0] < thr) continue;
    out[i] = 1;
    st.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  return (x, y) => {
    const xi = Math.round(x) - x0;
    const yi = Math.round(y) - y0;
    return xi >= 0 && yi >= 0 && xi < w && yi < h && out[yi * w + xi] === 1;
  };
}

/** Доля подвыборок ячейки сетки, где выполняется условие (4×4 точки на ячейку). */
function cover(x, y, test) {
  const [bx, by] = toBp(x, y);
  let n = 0;
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) if (test(bx - ((i + 0.5) / 4) * K, by + ((j + 0.5) / 4) * K)) n++;
  return n / 16;
}

// Снаружи машины — заливка фона от краёв кадра; всё, куда она не дошла, — машина.
const outsideSeeds = [];
for (let x = 520; x < 1600; x += 4) outsideSeeds.push([x, 1], [x, 338]);
for (let y = 0; y < 340; y += 4) outsideSeeds.push([521, y], [1598, y]);
const outsideFill = flood(outsideSeeds, 170);
// Всё за пределами кадра чертежа — тоже фон.
const outside = (x, y) => x < 521 || y < 1 || x > 1598 || y > 338 || outsideFill(x, y);
const glass = {
  door: flood([[1040, 95]], 150),
  quarter: flood([[1210, 80]], 150),
  wind: flood([[900, 100]], 150),
  rear: flood([[1320, 80]], 150),
};
const marker = flood([[856, 180]], 150);

const bits = () => new Uint8Array(W * H);
const body = bits();
const wing = bits();
const cls = {
  door: bits(),
  quarter: bits(),
  wind: bits(),
  rear: bits(),
  dark: bits(),
  head: bits(),
  marker: bits(),
};
const lines = bits();

const inPoly = (pts, px, py) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const mirror = new Set();
for (const [y, a, b] of MIRROR) for (let x = a; x <= b; x++) mirror.add(y * W + x);

for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (cover(x, y, (bx, by) => !outside(bx, by)) < 0.5) continue;
    if (mmFront(x) > 4180 && height(y) > 1030) {
      wing[i] = 1;
      continue;
    }
    if (mmFront(x) < 35 && height(y) < 230) continue; // губа V-spec
    if ([AXF, AXR].some((ax) => Math.hypot(x + 0.5 - ax, y + 0.5 - AXY) < ARCH_R)) continue;
    body[i] = 1;
    const dark = cover(x, y, (bx, by) => bpv(bx, by) < 110);
    // Линии чертежа серые (55…125), водяной знак светлее (≈200): порог 165 его не берёт.
    const ink = cover(x, y, (bx, by) => bpv(bx, by) < 165);
    let g = null;
    for (const [k, f] of Object.entries(glass)) if (cover(x, y, f) >= 0.5) g = k;
    if (inPoly(HEADLIGHT, x + 0.5, y + 0.5)) cls.head[i] = 1;
    else if (mirror.has(i)) {
      if (ink >= 0.25) lines[i] = 1;
    } else if (cover(x, y, marker) >= 0.4) cls.marker[i] = 1;
    else if (dark > 0.55) cls.dark[i] = 1;
    else if (g) cls[g][i] = 1;
    else if (ink >= 0.25) lines[i] = 1;
    if (cls.head[i] && ink >= 0.25) lines[i] = 1; // линии внутри фары — её рёбра и перегородка
  }

/** Убрать связные куски меньше min точек (шум сжатия чертежа). */
function prune(b, min) {
  const seen = new Uint8Array(b.length);
  for (let s = 0; s < b.length; s++) {
    if (!b[s] || seen[s]) continue;
    const blob = [];
    const st = [s];
    seen[s] = 1;
    while (st.length) {
      const i = st.pop();
      blob.push(i);
      const x = i % W;
      for (const dy of [-1, 0, 1])
        for (const dx of [-1, 0, 1]) {
          const j = i + dy * W + dx;
          if ((!dx && !dy) || j < 0 || j >= b.length || seen[j] || !b[j]) continue;
          if ((dx === -1 && x === 0) || (dx === 1 && x === W - 1)) continue;
          seen[j] = 1;
          st.push(j);
        }
    }
    if (blob.length < min) for (const i of blob) b[i] = 0;
  }
}
prune(cls.dark, 30);
prune(lines, 6);
// Тёмным у обычного GT-R остаются только рамки окон, стойка B и нижняя губа/кромка сзади.
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!cls.dark[i]) continue;
    if ((x > 680 && y < 242) || (x < 150 && y < 232) || (x > 200 && x < 680 && y > 200)) {
      cls.dark[i] = 0;
      lines[i] = 1;
    }
  }
// Одиночные точки «краски» внутри рамок окон становятся рамкой.
const glassy = (x, y) => {
  const i = y * W + x;
  return cls.door[i] || cls.quarter[i] || cls.wind[i] || cls.rear[i] || cls.dark[i];
};
for (let pass = 0; pass < 2; pass++)
  for (let y = 28; y < 128; y++)
    for (let x = 120; x < 640; x++) {
      const i = y * W + x;
      if (!body[i] || glassy(x, y) || mirror.has(i)) continue;
      let n = 0;
      for (let j = -1; j <= 1; j++)
        for (let k = -1; k <= 1; k++) if ((j || k) && glassy(x + k, y + j)) n++;
      if (n >= 5) {
        cls.dark[i] = 1;
        lines[i] = 0;
      }
    }

async function save(name, painter) {
  const buf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const c = painter(i);
    if (!c) continue;
    buf[i * 4] = c[0];
    buf[i * 4 + 1] = c[1];
    buf[i * 4 + 2] = c[2];
    buf[i * 4 + 3] = 255;
  }
  await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toFile(`${OUT}${name}`);
}
const COLORS = {
  door: [0, 0, 255],
  quarter: [0, 255, 255],
  wind: [255, 0, 255],
  rear: [255, 128, 0],
  dark: [0, 0, 0],
  head: [255, 255, 0],
  marker: [0, 255, 0],
};
await save('r34-silhouette.png', (i) => (body[i] ? [255, 255, 255] : null));
await save('r34-lines.png', (i) => (lines[i] && body[i] ? [0, 0, 0] : null));
await save('r34-parts.png', (i) => {
  if (wing[i]) return [255, 0, 0];
  for (const [k, c] of Object.entries(COLORS)) if (cls[k][i]) return c;
  return null;
});

let x0 = W;
let x1 = 0;
let y0 = H;
for (let i = 0; i < W * H; i++)
  if (body[i]) {
    x0 = Math.min(x0, i % W);
    x1 = Math.max(x1, i % W);
    y0 = Math.min(y0, (i / W) | 0);
  }
const meta = {
  $comment:
    'Сгенерировано tools/trace-car.mjs по чертежу R34 (вид сбоку). Сетка 864×288: кузов x 24…840, земля y 276. См. docs/car/r34-technical-map.md.',
  grid: { width: W, height: H, ground: GROUND, mmPerPoint: +MM.toFixed(4) },
  axles: { front: +AXF.toFixed(2), rear: +AXR.toFixed(2), y: +AXY.toFixed(2) },
  tireRadius: +TIRE_R.toFixed(2),
  rimRadius: +RIM_R.toFixed(2),
  archRadius: +ARCH_R.toFixed(2),
  check: {
    lengthMm: Math.round((x1 - x0 + 1) * MM),
    heightMm: Math.round((GROUND - y0) * MM),
    wheelbaseMm: Math.round((AXF - AXR) * MM),
    tireMm: Math.round(TIRE_R * 2 * MM),
    rimMm: Math.round(RIM_R * 2 * MM),
  },
};
writeFileSync(`${OUT}r34-geometry.json`, await format(JSON.stringify(meta), { parser: 'json' }));
console.log(JSON.stringify(meta.check), 'оси', meta.axles);
