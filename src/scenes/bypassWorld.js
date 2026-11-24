/**
 * bypassWorld — бесконечная «Объездная дорога»: смешанный лес у трассы, как на фото-референсе
 * (art/source/bypass-reference.jpg). Рисуется кодом на canvas, кусками по мере езды.
 *
 * Мир свой у каждого игрока: всё выводится из сида (gameState.flags.worldSeed) и координаты,
 * поэтому у одного игрока дорога всегда одна и та же, а у другого — другая. Вдоль дороги
 * сменяются участки леса (смешанный, сосняк, ельник, березняк, поле, болотце), между ними —
 * плавный переход. На обочине — сигнальные столбики, километровые столбы, знаки; на карманах —
 * остановки, фуры, рекламные щиты, бабушка с мёдом.
 *
 * Слои параллакса (k — доля скорости дороги), снизу вверх:
 *   небо (бесшовная полоса) → дальний лес в дымке → лес → карманы у дороги →
 *   ближние деревья → обочина и асфальт.
 * Каждый слой режется на куски шириной CW; кусок рисует и соседние объекты, которые в него
 * заходят, — швов нет. Ушедшие за экран куски удаляются вместе с текстурами.
 */
import Phaser from 'phaser';
import { getRenderZoom } from '../systems/scale.js';

const VIEW_W = 640;
const CW = 640; // ширина куска слоя, точек мира
const HAZE = '#b7bfc1';

const LAYERS = [
  { id: 'far', k: 0.12, y0: 40, y1: 232 },
  { id: 'mid', k: 0.3, y0: 0, y1: 234 },
  { id: 'back', k: 0.45, y0: 40, y1: 234 },
  { id: 'near', k: 0.65, y0: 0, y1: 236 },
  { id: 'road', k: 1, y0: 140, y1: 360 },
];

// ---------- Случайность от сида ----------

function hash(seed, a, b = 0, c = 0) {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ Math.imul(a | 0, 0xcc9e2d51), 0x1b873593);
  h = Math.imul(h ^ Math.imul(b | 0, 0x27d4eb2f), 0x165667b1);
  h = Math.imul(h ^ Math.imul(c | 0, 0x9e3779b1), 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

function rand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];

// ---------- Цвет ----------

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Смесь цвета с дымкой: t = 0 — свой цвет, 1 — цвет воздуха. */
function mix(hex, t, to = HAZE) {
  const a = rgb(hex);
  const b = rgb(to);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ---------- Участки леса вдоль дороги ----------

const BIOMES = {
  mixed: { birch: 0.35, pine: 0.25, spruce: 0.4, density: 1, clearing: 0, swamp: 0, w: 3 },
  pine: { birch: 0.12, pine: 0.7, spruce: 0.18, density: 0.75, clearing: 0, swamp: 0, w: 2 },
  spruce: { birch: 0.1, pine: 0.1, spruce: 0.8, density: 1.15, clearing: 0, swamp: 0, w: 2 },
  birch: { birch: 0.8, pine: 0.08, spruce: 0.12, density: 0.85, clearing: 0, swamp: 0, w: 2 },
  clearing: { birch: 0.5, pine: 0.2, spruce: 0.3, density: 0.12, clearing: 1, swamp: 0, w: 1.4 },
  swamp: { birch: 0.6, pine: 0.15, spruce: 0.25, density: 0.4, clearing: 0, swamp: 1, w: 1 },
};
const BIOME_IDS = Object.keys(BIOMES);
const REGION_M = 420;

function regionBiome(seed, i) {
  if (i === 0) return BIOMES.mixed; // старт — как на фото
  const total = BIOME_IDS.reduce((s, id) => s + BIOMES[id].w, 0);
  let v = hash(seed, i, 77) * total;
  for (const id of BIOME_IDS) {
    v -= BIOMES[id].w;
    if (v <= 0) return BIOMES[id];
  }
  return BIOMES.mixed;
}

/** Параметры леса у метра дороги m — с плавным переходом на стыке участков. */
function biomeAt(seed, m) {
  const f = m / REGION_M;
  const i = Math.floor(f);
  const t = f - i;
  const a = regionBiome(seed, i);
  const edge = 0.15;
  let b = a;
  let w = 0;
  if (t > 1 - edge) {
    b = regionBiome(seed, i + 1);
    w = ((t - (1 - edge)) / edge) * 0.5;
  } else if (t < edge) {
    b = regionBiome(seed, i - 1);
    w = (1 - t / edge) * 0.5;
  }
  const out = {};
  for (const key of ['birch', 'pine', 'spruce', 'density', 'clearing', 'swamp'])
    out[key] = a[key] + (b[key] - a[key]) * w;
  return out;
}

// ---------- Деревья и растения (canvas, единицы мира) ----------

function spruce(ctx, o) {
  const { x, base, h, haze, r } = o;
  const w = h * (0.3 + r() * 0.08);
  const tiers = 7 + Math.floor(h / 14);
  ctx.fillStyle = mix('#3a2e26', haze);
  ctx.fillRect(x - h * 0.012, base - h * 0.12, Math.max(0.8, h * 0.024), h * 0.12);
  for (let i = 0; i < tiers; i++) {
    const k = (i + 1) / tiers;
    const top = base - h + (i / tiers) * h * 0.9;
    const hw = ((k * w) / 2) * (0.85 + r() * 0.3);
    const th = ((h * 0.9) / tiers) * 1.7;
    const dark = mix('#1d3326', haze);
    const lit = mix('#36533c', haze);
    const shape = (s) => {
      ctx.beginPath();
      ctx.moveTo(x, top - th * 0.25);
      const steps = 5;
      for (let j = 0; j <= steps; j++) {
        const u = j / steps;
        const px = x - hw * s + hw * 2 * s * u;
        const droop = th * (0.75 + 0.35 * Math.sin(u * Math.PI)) + (r() - 0.5) * th * 0.25;
        ctx.lineTo(px, top + droop);
      }
      ctx.closePath();
      ctx.fill();
    };
    ctx.fillStyle = dark;
    shape(1);
    // Свет сверху слева: светлее левая верхняя часть яруса.
    ctx.fillStyle = lit;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(x, top - th * 0.2);
    ctx.lineTo(x - hw * 0.9, top + th * 0.75);
    ctx.lineTo(x - hw * 0.2, top + th * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/**
 * Пучок листвы. Силуэт — объединение нескольких округлых долей (как у живой кроны);
 * свет, тень и листья рисуются только внутри силуэта (clip), поэтому ничего не висит
 * в воздухе рядом с кроной. colors — от тёмного к светлому.
 */
function clump(ctx, r, cx, cy, rx, ry, colors, n, size) {
  const last = colors.length - 1;
  const lobes = [];
  // Много мелких долей, каждая растёт от уже поставленной — крона цельная, без
  // оторванных кружков, а край бугристый, как у живой листвы.
  lobes.push([0, 0, 0.62]);
  const k = 14 + Math.floor(r() * 10);
  for (let tries = 0; lobes.length < k && tries < k * 6; tries++) {
    const [px, py, pr] = lobes[Math.floor(r() * lobes.length)];
    const rr = 0.24 + r() * 0.22;
    const a = r() * Math.PI * 2;
    const d = (pr + rr) * (0.45 + r() * 0.25);
    const x = px + Math.cos(a) * d;
    const y = py + Math.sin(a) * d;
    if (x * x + y * y > 0.85) continue; // держимся в очертании пучка
    lobes.push([x, y, rr]);
  }
  const path = () => {
    ctx.beginPath();
    for (const [x, y, rr] of lobes) {
      ctx.moveTo(cx + (x + rr) * rx, cy + y * ry);
      ctx.ellipse(cx + x * rx, cy + y * ry, rr * rx, rr * ry, 0, 0, Math.PI * 2);
    }
  };
  ctx.save();
  path();
  ctx.fillStyle = colors[Math.min(last, 1)];
  ctx.fill();
  ctx.clip();
  // Тень снизу справа, свет сверху слева.
  const R = Math.max(rx, ry);
  const g = ctx.createRadialGradient(cx - rx * 0.45, cy - ry * 0.55, R * 0.1, cx, cy, R * 1.3);
  g.addColorStop(0, colors[last]);
  g.addColorStop(0.45, colors[Math.min(last, 2)]);
  g.addColorStop(1, colors[0]);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = g;
  ctx.fillRect(cx - rx * 1.2, cy - ry * 1.2, rx * 2.4, ry * 2.4);
  // Просветы в глубине кроны — тёмные провалы между ветками.
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = colors[0];
  for (let i = 0; i < 4 + k / 3; i++) {
    const dx = (r() * 2 - 1) * 0.6;
    const dy = r() * 0.8 - 0.1;
    ctx.beginPath();
    ctx.ellipse(
      cx + dx * rx,
      cy + dy * ry,
      rx * (0.08 + r() * 0.1),
      ry * (0.05 + r() * 0.08),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  // Листва: мелкие пятнышки внутри силуэта, светлее к свету.
  ctx.globalAlpha = 0.75;
  const count = Math.round(n);
  const sz = size;
  for (let i = 0; i < count; i++) {
    const dx = (r() * 2 - 1) * 1.05;
    const dy = (r() * 2 - 1) * 1.05;
    const light = 0.5 - (dx + dy) * 0.35 + (r() - 0.5) * 0.5;
    ctx.fillStyle = colors[Math.max(0, Math.min(last, Math.round(light * last)))];
    const w = sz * (0.6 + r() * 0.8);
    ctx.fillRect(cx + dx * rx - w / 2, cy + dy * ry - w * 0.3, w, w * 0.6);
  }
  ctx.restore();
}

function pine(ctx, o) {
  const { x, base, h, haze, r } = o;
  const lean = (r() - 0.5) * h * 0.04;
  const top = base - h * 0.94;
  const w = Math.max(1, h * 0.022);
  const g = ctx.createLinearGradient(0, base, 0, top);
  g.addColorStop(0, mix('#4e3f33', haze));
  g.addColorStop(0.35, mix('#8a5a3a', haze));
  g.addColorStop(1, mix('#b8763f', haze));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, base);
  ctx.lineTo(x + w / 2, base);
  ctx.lineTo(x + lean + w * 0.25, top);
  ctx.lineTo(x + lean - w * 0.25, top);
  ctx.closePath();
  ctx.fill();
  // Крона — несколько плоских шапок наверху.
  const dark = [
    mix('#18291e', haze),
    mix('#1f3526', haze),
    mix('#294230', haze),
    mix('#35523b', haze),
  ];
  clump(ctx, r, x + lean, top, h * 0.085, h * 0.06, dark, 10, h * 0.018);
  for (const side of [-1, 1]) {
    const cy = top + h * (0.035 + r() * 0.025);
    const cx = x + lean + side * h * (0.042 + r() * 0.02);
    const rx = h * (0.07 + r() * 0.07);
    const ry = h * (0.03 + r() * 0.025);
    clump(ctx, r, cx, cy, rx, ry, dark, 12, Math.max(1, h * 0.02));
  }
}

function birch(ctx, o) {
  const { x, base, h, haze, r } = o;
  const lean = (r() - 0.5) * h * 0.08;
  const w = Math.max(1, h * 0.022);
  const top = base - h * 0.87;
  const tx = (y) => x + lean * ((base - y) / h) ** 1.4;
  const wAt = (y) => w * (1 - 0.8 * ((base - y) / (base - top)));
  const leaves = [
    mix('#3d5732', haze),
    mix('#55743f', haze),
    mix('#6b8c4b', haze),
    mix('#83a259', haze),
    mix(r() < 0.25 ? '#b9b25c' : '#9bb86d', haze), // у части — желтеющие пряди
  ];
  // Ствол: светло-серо-белый, с мягкой тенью справа.
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, mix('#f1efe8', haze * 0.6));
  g.addColorStop(0.6, mix('#e2dfd6', haze * 0.6));
  g.addColorStop(1, mix('#b8b4aa', haze * 0.6));
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    for (let i = 0; i <= 8; i++) {
      const y = side < 0 ? base + ((top - base) * i) / 8 : top + ((base - top) * i) / 8;
      ctx.lineTo(tx(y) + (side * wAt(y)) / 2, y);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.clip();
  // Кора: редкие неровные тёмные пятна и тонкие поперечные чечевички, внизу — тёмный комель.
  const marks = 6 + Math.floor(h / 14);
  for (let i = 0; i < marks; i++) {
    const t = 0.08 + r() ** 1.3 * 0.6;
    const y = base - t * h;
    const ww = wAt(y);
    const big = r() < 0.35;
    const mw = ww * (big ? 0.5 + r() * 0.5 : 0.25 + r() * 0.35);
    const mh = big ? 0.8 + r() * 1.2 : 0.35 + r() * 0.3;
    ctx.fillStyle = mix(big ? '#2b2826' : '#4a4540', haze);
    const ox = r() < 0.5 ? -ww / 2 : ww / 2 - mw; // пятна чаще с краю ствола
    ctx.beginPath();
    ctx.ellipse(tx(y) + ox + mw / 2, y, mw / 2, mh / 2, (r() - 0.5) * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  const bg = ctx.createLinearGradient(0, base, 0, base - h * 0.12);
  bg.addColorStop(0, mix('#3a3430', haze));
  bg.addColorStop(1, 'rgba(58,52,48,0)');
  ctx.fillStyle = bg;
  ctx.fillRect(x - w / 2, base - h * 0.12, w, h * 0.12);
  ctx.restore();
  // Центральная крона и нисходящие боковые ветви сходятся вокруг ствола.
  clump(ctx, r, tx(base - h * 0.75), base - h * 0.75, h * 0.1, h * 0.24, leaves, 18, h * 0.019);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const y = base - h * (0.79 - i * 0.1 + r() * 0.04);
      const spread = h * (0.045 + i * 0.018);
      clump(ctx, r, tx(y) + side * spread, y, spread * 1.1, h * 0.11, leaves, 8, h * 0.016);
    }
  }
}

function bush(ctx, o) {
  const { x, base, h, haze, r } = o;
  const cols = [mix('#3f5c3a', haze), mix('#4f6d44', haze), mix('#6a8550', haze)];
  clump(
    ctx,
    r,
    x,
    base - h * 0.45,
    h * 0.6,
    h * 0.45,
    [mix('#2c4430', haze), ...cols],
    30 + h,
    Math.max(0.7, h * 0.07),
  );
}

function grassTuft(ctx, o) {
  const { x, base, h, haze, r } = o;
  const cols = ['#a39a6a', '#8f8b5c', '#b6ab7d', '#7b8650', '#6c7a48', '#c2b98e'].map((c) =>
    mix(c, haze),
  );
  const n = 6 + Math.floor(r() * 8);
  for (let i = 0; i < n; i++) {
    const bx = x + (r() - 0.5) * 6;
    const len = h * (0.5 + r() * 0.6);
    ctx.strokeStyle = cols[Math.floor(r() * cols.length)];
    ctx.lineWidth = 0.35 + r() * 0.4;
    ctx.beginPath();
    ctx.moveTo(bx, base);
    ctx.quadraticCurveTo(bx + (r() - 0.5) * 3, base - len * 0.6, bx + (r() - 0.5) * 6, base - len);
    ctx.stroke();
  }
}

const DRAW = { spruce, pine, birch, bush, grass: grassTuft };

// ---------- Сооружения у дороги ----------

const STOPS = [
  'Сосновка',
  'Лесхоз',
  'Ключи',
  'Поворот на Дубки',
  'СНТ «Рассвет»',
  'Берёзовка',
  'Совхоз',
  'Карьер',
];
const TRUCK_LOGOS = ['ЛЕСТРАНС', 'СЕВЕРТРАНС', 'ВОЛГА-ЛОГИСТИК', 'АГРОХОЛОД', 'ТРАНСЛЕС', ''];
const ADS = [
  ['ШИНОМОНТАЖ 24 Ч', '→ 2 км', '#e2661c'],
  ['КАФЕ «У ДОРОГИ»', 'шашлык · пельмени', '#b0262c'],
  ['ДАЧИ «БЕРЁЗКИ»', 'участки у леса', '#2f7a3d'],
  ['АВТОМОЙКА', 'круглосуточно', '#2a5ad0'],
  ['ЗАПЧАСТИ', 'для иномарок и наших', '#d9a93a'],
];
const FONT = '"Onest Variable", Onest, system-ui, sans-serif';

function text(ctx, s, x, y, size, color, align = 'center') {
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

/** Гравийный карман у дороги под сооружением. */
function layby(ctx, x0, x1, base, r) {
  ctx.fillStyle = '#8a8473';
  ctx.fillRect(x0, base - 3, x1 - x0, 6);
  for (let i = 0; i < (x1 - x0) * 0.8; i++) {
    ctx.fillStyle = r() < 0.5 ? '#9d978a' : '#6f6a5e';
    ctx.fillRect(x0 + r() * (x1 - x0), base - 3 + r() * 6, 0.8, 0.6);
  }
}

function busStop(ctx, o) {
  const { x, base, r } = o;
  const w = 110;
  const hgt = 56;
  layby(ctx, x - 20, x + w + 40, base, r);
  // Задняя стена с мозаикой.
  ctx.fillStyle = '#c9c4b8';
  ctx.fillRect(x, base - hgt, w, hgt);
  const tiles = ['#2f6fb0', '#e0a13a', '#c94a3a', '#e8e2d2', '#3d8a5a'];
  for (let ty = base - hgt + 8; ty < base - 14; ty += 3)
    for (let tx = x + 6; tx < x + w - 6; tx += 3) {
      const u = (tx - x) / w;
      const v = (ty - (base - hgt)) / hgt;
      const band = Math.floor((u * 3 + Math.sin(v * 6 + u * 4) * 0.6 + 3) % tiles.length);
      ctx.fillStyle = tiles[band];
      ctx.fillRect(tx, ty, 2.6, 2.6);
    }
  // Боковины и плита крыши.
  ctx.fillStyle = '#b3aea2';
  ctx.fillRect(x - 3, base - hgt, 5, hgt);
  ctx.fillRect(x + w - 2, base - hgt, 5, hgt);
  ctx.fillStyle = '#a49f94';
  ctx.fillRect(x - 10, base - hgt - 6, w + 20, 7);
  ctx.fillStyle = '#8c877c';
  ctx.fillRect(x - 10, base - hgt + 1, w + 20, 1.5);
  // Скамья и урна.
  ctx.fillStyle = '#6b4e36';
  ctx.fillRect(x + 14, base - 14, w - 28, 3);
  ctx.fillStyle = '#4a4744';
  ctx.fillRect(x + 18, base - 11, 2, 11);
  ctx.fillRect(x + w - 20, base - 11, 2, 11);
  ctx.fillStyle = '#5a6b5a';
  ctx.fillRect(x + w + 10, base - 10, 7, 10);
  // Знак остановки и табличка с названием.
  const sx = x + w + 26;
  ctx.fillStyle = '#7d8084';
  ctx.fillRect(sx, base - 62, 1.6, 62);
  ctx.fillStyle = '#f2f0ea';
  ctx.fillRect(sx - 7, base - 64, 15, 15);
  ctx.strokeStyle = '#1d4fa0';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(sx - 6.4, base - 63.4, 13.8, 13.8);
  text(ctx, 'А', sx + 0.5, base - 56.3, 10, '#1b1b1d');
  const name = o.name;
  ctx.font = `700 6px ${FONT}`;
  const nw = ctx.measureText(name).width + 6;
  ctx.fillStyle = '#f2f0ea';
  ctx.fillRect(sx - nw / 2, base - 47, nw, 8);
  text(ctx, name, sx, base - 42.8, 6, '#1b1b1d');
}

function truck(ctx, o) {
  const { x, base, r } = o;
  const cabCol = pick(r, ['#d9641e', '#2a52b0', '#e8e6df', '#8b1a2b', '#3d6b45']);
  const trailer = pick(r, ['#e6e4dc', '#c8ccd0', '#9aa3ab', '#d6cfb8']);
  const logo = pick(r, TRUCK_LOGOS);
  const L = 300;
  const right = r() < 0.6; // кабиной вправо (по ходу) или назад
  layby(ctx, x - 20, x + L + 20, base, r);
  const wheel = (cx) => {
    ctx.fillStyle = '#16171a';
    ctx.beginPath();
    ctx.arc(cx, base - 8, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6b6f75';
    ctx.beginPath();
    ctx.arc(cx, base - 8, 3.6, 0, Math.PI * 2);
    ctx.fill();
  };
  const tx0 = right ? x : x + 64;
  const cx0 = right ? x + L - 62 : x;
  // Полуприцеп-тент.
  ctx.fillStyle = trailer;
  ctx.fillRect(tx0, base - 92, 236, 74);
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 236; i += 26) ctx.fillRect(tx0 + i, base - 92, 1, 74);
  ctx.fillStyle = '#3a3c40';
  ctx.fillRect(tx0, base - 20, 236, 6);
  if (logo) text(ctx, logo, tx0 + 118, base - 58, 15, '#2f3a4a');
  for (const k of [30, 50, 70]) wheel(right ? tx0 + k : tx0 + 236 - k);
  // Тягач.
  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(cx0, base - 22, 62, 8);
  ctx.fillStyle = cabCol;
  const fx = right ? cx0 + 62 : cx0;
  ctx.beginPath();
  ctx.moveTo(cx0 + (right ? 8 : 0), base - 18);
  ctx.lineTo(cx0 + (right ? 8 : 0), base - 84);
  ctx.lineTo(fx + (right ? -4 : 4), base - 84);
  ctx.lineTo(fx, base - 70);
  ctx.lineTo(fx, base - 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#9fb3c2';
  ctx.fillRect(right ? fx - 22 : fx + 4, base - 78, 18, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(right ? fx - 20 : fx + 6, base - 76, 5, 14);
  ctx.fillStyle = '#c9c9c4';
  ctx.fillRect(right ? fx - 4 : fx, base - 30, 4, 10);
  wheel(right ? cx0 + 46 : cx0 + 16);
  wheel(right ? cx0 + 14 : cx0 + 48);
}

function billboard(ctx, o) {
  const { x, base, r } = o;
  const [title, sub, col] = pick(r, ADS);
  ctx.fillStyle = '#5d6166';
  ctx.fillRect(x + 20, base - 70, 3, 70);
  ctx.fillRect(x + 95, base - 70, 3, 70);
  ctx.fillStyle = '#eeeae0';
  ctx.fillRect(x, base - 112, 118, 46);
  ctx.fillStyle = col;
  ctx.fillRect(x, base - 112, 118, 8);
  ctx.fillRect(x, base - 74, 118, 8);
  text(ctx, title, x + 59, base - 94, 10, '#1d1d1f');
  text(ctx, sub, x + 59, base - 82, 7, '#3a3a3c');
  // Выгоревшие края.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x, base - 112, 118, 46);
}

function honeyStand(ctx, o) {
  const { x, base, r } = o;
  layby(ctx, x - 10, x + 70, base, r);
  // Зонт, стол с банками, бабушка на табуретке.
  ctx.fillStyle = '#6b6f75';
  ctx.fillRect(x + 30, base - 52, 1.4, 52);
  ctx.fillStyle = pick(r, ['#c94a3a', '#2f6fb0', '#3d8a5a']);
  ctx.beginPath();
  ctx.moveTo(x + 6, base - 46);
  ctx.quadraticCurveTo(x + 31, base - 64, x + 56, base - 46);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#7a5a3e';
  ctx.fillRect(x + 8, base - 20, 46, 3);
  ctx.fillRect(x + 10, base - 17, 2, 17);
  ctx.fillRect(x + 50, base - 17, 2, 17);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 3 === 2 ? '#7a2a3a' : '#d99a2a';
    ctx.fillRect(x + 11 + i * 7, base - 27, 5, 7);
    ctx.fillStyle = '#e8e2d2';
    ctx.fillRect(x + 11 + i * 7, base - 28, 5, 1.5);
  }
  ctx.fillStyle = '#e8e2d2';
  ctx.fillRect(x + 12, base - 40, 30, 9);
  text(ctx, 'МЁД · ГРИБЫ', x + 27, base - 35.5, 5, '#2a2a2a');
  // Бабушка: платок, пальто.
  const bx = x + 62;
  ctx.fillStyle = '#4a3a5a';
  ctx.fillRect(bx - 5, base - 22, 10, 14);
  ctx.fillStyle = '#3a3634';
  ctx.fillRect(bx - 4, base - 8, 3, 8);
  ctx.fillRect(bx + 1, base - 8, 3, 8);
  ctx.fillStyle = '#d6b49a';
  ctx.beginPath();
  ctx.arc(bx, base - 26, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b0262c';
  ctx.beginPath();
  ctx.arc(bx, base - 27, 3.8, Math.PI, 0);
  ctx.fill();
}

function farHouses(ctx, o) {
  const { x, base, r, haze } = o;
  for (let i = 0; i < 4; i++) {
    const hx = x + i * 18 + r() * 6;
    const w = 12 + r() * 6;
    ctx.fillStyle = mix(pick(r, ['#8a6a4e', '#6f7f8f', '#9a8a6a', '#7a8a6a']), haze);
    ctx.fillRect(hx, base - 9, w, 9);
    ctx.fillStyle = mix(pick(r, ['#5a5f66', '#7a3b30', '#4a6a5a']), haze);
    ctx.beginPath();
    ctx.moveTo(hx - 1, base - 9);
    ctx.lineTo(hx + w / 2, base - 15);
    ctx.lineTo(hx + w + 1, base - 9);
    ctx.closePath();
    ctx.fill();
  }
}

function hayBale(ctx, o) {
  const { x, base, haze } = o;
  ctx.fillStyle = mix('#b59a5a', haze);
  ctx.beginPath();
  ctx.ellipse(x, base - 5, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = mix('#8c7440', haze);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(x, base - 5, 3, 0, Math.PI * 2);
  ctx.stroke();
}

Object.assign(DRAW, { busStop, truck, billboard, honeyStand, farHouses, hayBale });

// ---------- Генерация объектов по кускам ----------

/** Объекты куска ci слоя: { kind, x, base, h, haze, seed, w (размах для отбора) }. */
function chunkObjects(seed, layer, ci, ppm) {
  const r = rand(hash(seed, ci, layer.id.length * 991 + layer.id.charCodeAt(0)) * 2 ** 32);
  const x0 = ci * CW;
  const list = [];
  const meterOf = (x) => x / (layer.k * ppm);
  const add = (kind, x, base, h, haze, w) =>
    list.push({ kind, x, base, h, haze, w, seed: Math.floor(r() * 2 ** 31) });
  const tree = (b) => {
    const v = r() * (b.birch + b.pine + b.spruce);
    return v < b.birch ? 'birch' : v < b.birch + b.pine ? 'pine' : 'spruce';
  };

  if (layer.id === 'far') {
    for (let x = x0; x < x0 + CW; x += 2 + r() * 4) {
      const b = biomeAt(seed, meterOf(x));
      const kind = r() < b.spruce + b.pine * 0.5 ? 'spruce' : 'bush';
      const h = kind === 'spruce' ? 40 + r() * 55 : 22 + r() * 22;
      add(kind, x, 214 + r() * 6, h, 0.62 + r() * 0.1, h * 0.85);
      if (b.clearing > 0.5 && r() < 0.004) add('farHouses', x, 222, 0, 0.5, 90);
    }
  } else if (layer.id === 'mid') {
    for (let x = x0; x < x0 + CW; x += 9 + r() * 16) {
      const b = biomeAt(seed, meterOf(x));
      if (r() > b.density) {
        if (b.clearing > 0.5 && r() < 0.05) add('hayBale', x, 228, 0, 0.25, 10);
        continue;
      }
      const kind = tree(b);
      const h =
        kind === 'pine' ? 160 + r() * 70 : kind === 'birch' ? 120 + r() * 70 : 110 + r() * 80;
      add(kind, x, 218 + r() * 8, h, 0.18 + r() * 0.12, h * 0.35);
    }
  } else if (layer.id === 'back') {
    // Сооружения — редкие, в своих «окнах» по 6 кусков.
    const slot = Math.floor(ci / 6);
    const rs = rand(hash(seed, slot, 4242) * 2 ** 32);
    const at = slot * 6 + Math.floor(rs() * 6);
    if (at === ci && rs() < 0.75) {
      const kind = pick(rs, ['busStop', 'truck', 'billboard', 'honeyStand', 'busStop', 'truck']);
      list.push({
        kind,
        x: x0 + 40 + rs() * 200,
        base: 230,
        h: 0,
        haze: 0,
        w: 380,
        seed: Math.floor(rs() * 2 ** 31),
        name: pick(rs, STOPS),
      });
    }
    for (let x = x0; x < x0 + CW; x += 14 + r() * 30) {
      const b = biomeAt(seed, meterOf(x));
      if (r() < 0.3 + b.density * 0.3) add('bush', x, 229, 8 + r() * 12, 0.08, 15);
    }
  } else if (layer.id === 'near') {
    for (let x = x0; x < x0 + CW; x += 30 + r() * 70) {
      const b = biomeAt(seed, meterOf(x));
      const v = r();
      if (v < 0.18 * b.density) {
        const kind = tree(b);
        const h = kind === 'pine' ? 260 + r() * 80 : 200 + r() * 90;
        add(kind, x, 233 + r() * 2, h, 0.04, h * 0.35);
      } else if (v < 0.55) {
        add(r() < 0.5 ? 'spruce' : 'bush', x, 233, 18 + r() * 30, 0.06, 25);
      }
    }
    for (let x = x0; x < x0 + CW; x += 3 + r() * 5) add('grass', x, 234, 8 + r() * 12, 0.05, 8);
  }
  return list;
}

// ---------- Дорога ----------

function drawRoad(ctx, seed, x0, ppm) {
  const x1 = x0 + CW;
  // Трава на обочине за асфальтом.
  const g = ctx.createLinearGradient(0, 200, 0, 232);
  g.addColorStop(0, '#6f7a4c');
  g.addColorStop(1, '#8e8a5f');
  ctx.fillStyle = g;
  ctx.fillRect(x0, 210, CW, 22);
  // Щебёночная бровка.
  ctx.fillStyle = '#8b8577';
  ctx.fillRect(x0, 228, CW, 5);
  // Асфальт: ровная основа, зерно по мировым координатам (без швов), заплаты, трещины.
  ctx.fillStyle = '#57595c';
  ctx.fillRect(x0, 232, CW, 128);
  for (let y = 232; y < 360; y += 2)
    for (let x = Math.floor(x0 / 2) * 2; x < x1; x += 2) {
      const v = hash(seed, x, y, 9);
      if (v < 0.06) {
        ctx.fillStyle = v < 0.03 ? '#545659' : '#5b5d60';
        ctx.fillRect(x, y, 2, 1);
      }
    }
  // Заплаты и трещины — объекты с привязкой к своему метру (по сиду).
  for (let m = Math.floor((x0 - 480) / ppm / 7) * 7; m * ppm < x1 + 120; m += 7) {
    const h = hash(seed, m, 6061);
    if (h > 0.35) continue;
    const px = m * ppm + hash(seed, m, 6062) * 200;
    const py = 236 + hash(seed, m, 6063) * 110;
    const w = 40 + hash(seed, m, 6064) * 120;
    ctx.fillStyle = h < 0.15 ? '#434548' : '#4d4f52';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + w * 0.3, py - 3);
    ctx.lineTo(px + w, py - 1);
    ctx.lineTo(px + w * 0.9, py + 6);
    ctx.lineTo(px + w * 0.2, py + 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#3a3b3d';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    let cx = px + w;
    let cy = py + 2;
    ctx.moveTo(cx, cy);
    for (let i = 0; i < 6; i++) {
      cx += 8 + hash(seed, m, 6070 + i) * 14;
      cy += (hash(seed, m, 6080 + i) - 0.5) * 8;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(232,230,220,0.85)';
  ctx.fillRect(x0, 238, CW, 1.6);
  const period = 12 * ppm;
  for (let s = Math.floor(x0 / period) * period; s < x1; s += period) {
    ctx.fillStyle = 'rgba(232,230,220,0.88)';
    ctx.fillRect(s, 302, 3 * ppm, 2);
  }
  ctx.fillStyle = 'rgba(232,230,220,0.8)';
  ctx.fillRect(x0, 352, CW, 1.6);
}

/** Масштаб предметов дальней обочины: она за машиной, поэтому всё там видно мельче. */
const FAR_SIDE = 0.6;

/** Объекты обочины (k = 1, в метрах): столбики, километровые столбы, знаки. */
function roadObjects(seed, ci, ppm) {
  const list = [];
  const m0 = (ci * CW) / ppm;
  const m1 = ((ci + 1) * CW) / ppm;
  for (let m = Math.ceil(m0 / 40) * 40; m < m1; m += 40)
    list.push({ kind: 'post', x: m * ppm + hash(seed, m, 3) * 20, base: 233, scale: FAR_SIDE });
  for (let m = Math.ceil(m0 / 1000) * 1000; m < m1; m += 1000)
    list.push({
      kind: 'km',
      x: m * ppm + 60,
      base: 233,
      km: Math.round(m / 1000) + 12,
      scale: FAR_SIDE,
    });
  for (let m = Math.ceil(m0 / 250) * 250; m < m1; m += 250) {
    const h = hash(seed, m, 8080);
    if (h < 0.45) {
      list.push({
        kind: 'sign',
        x: m * ppm + 160,
        base: 232,
        scale: FAR_SIDE,
        sign: pick(rand(h * 2 ** 32), ['elk', 'speed', 'speed', 'direction', 'elk']),
      });
    }
  }
  for (let x = ci * CW; x < (ci + 1) * CW; x += 3 + hash(seed, x, 12) * 4)
    list.push({
      kind: 'grass',
      x,
      base: 229 + hash(seed, x, 13) * 2,
      h: 5 + hash(seed, x, 14) * 9,
      haze: 0,
      seed: Math.floor(hash(seed, x, 15) * 2 ** 31),
    });
  return list;
}

function post(ctx, o) {
  const { x, base } = o;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x - 3, base - 1, 9, 2);
  ctx.fillStyle = '#f0efe9';
  ctx.fillRect(x - 3, base - 62, 6, 62);
  ctx.fillStyle = '#c9c7c0';
  ctx.fillRect(x + 1.5, base - 62, 1.5, 62);
  ctx.fillStyle = '#1b1b1d';
  ctx.beginPath();
  ctx.moveTo(x - 3, base - 46);
  ctx.lineTo(x + 3, base - 50);
  ctx.lineTo(x + 3, base - 40);
  ctx.lineTo(x - 3, base - 36);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8e8e0';
  ctx.fillRect(x - 1, base - 47, 2, 5);
}

function kmPost(ctx, o) {
  const { x, base, km } = o;
  ctx.fillStyle = '#7d8084';
  ctx.fillRect(x - 0.8, base - 44, 1.6, 44);
  ctx.fillStyle = '#f2f0ea';
  ctx.fillRect(x - 10, base - 52, 20, 14);
  ctx.strokeStyle = '#1b1b1d';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(x - 9.5, base - 51.5, 19, 13);
  text(ctx, String(km), x, base - 45, 9, '#1b1b1d');
}

function roadSign(ctx, o) {
  const { x, base, sign } = o;
  ctx.fillStyle = '#7d8084';
  ctx.fillRect(x - 0.9, base - 70, 1.8, 70);
  if (sign === 'elk') {
    ctx.fillStyle = '#c8202a';
    ctx.beginPath();
    ctx.moveTo(x, base - 92);
    ctx.lineTo(x + 14, base - 68);
    ctx.lineTo(x - 14, base - 68);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f2f0ea';
    ctx.beginPath();
    ctx.moveTo(x, base - 87);
    ctx.lineTo(x + 10, base - 71);
    ctx.lineTo(x - 10, base - 71);
    ctx.closePath();
    ctx.fill();
    // Лось: туловище, ноги, голова с рогами.
    ctx.fillStyle = '#1b1b1d';
    ctx.fillRect(x - 5, base - 78, 8, 3);
    ctx.fillRect(x - 5, base - 75, 1, 3);
    ctx.fillRect(x + 2, base - 75, 1, 3);
    ctx.fillRect(x + 3, base - 81, 2, 4);
    ctx.fillRect(x + 2, base - 83, 5, 1);
  } else if (sign === 'speed') {
    ctx.fillStyle = '#c8202a';
    ctx.beginPath();
    ctx.arc(x, base - 80, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2f0ea';
    ctx.beginPath();
    ctx.arc(x, base - 80, 9, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, String(o.limit ?? 90), x, base - 80, 9, '#1b1b1d');
  } else {
    ctx.fillRect(x + 40, base - 70, 1.8, 70);
    ctx.fillStyle = '#1d4fa0';
    ctx.fillRect(x - 12, base - 100, 66, 30);
    ctx.strokeStyle = '#f2f0ea';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x - 10.5, base - 98.5, 63, 27);
    text(ctx, 'Москва 112', x - 6, base - 91, 7, '#f2f0ea', 'left');
    text(ctx, 'Тверь 48', x - 6, base - 80, 7, '#f2f0ea', 'left');
  }
}

Object.assign(DRAW, { post, km: kmPost, sign: roadSign });

// ---------- Небо ----------

function drawSky(ctx, seed, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#b9c0c6');
  g.addColorStop(0.6, '#d2d6d9');
  g.addColorStop(1, '#dfe1e1');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const r = rand(hash(seed, 1, 2024) * 2 ** 32);
  // Слоистые облака: мягкие пятна, повторённые со сдвигом на ширину — полоса бесшовная.
  ctx.filter = 'blur(6px)';
  for (let i = 0; i < 40; i++) {
    const x = r() * w;
    const y = 10 + r() * h * 0.55;
    const rx = 30 + r() * 90;
    const ry = 6 + r() * 16;
    const light = r() < 0.55;
    ctx.fillStyle = light ? 'rgba(236,238,239,0.55)' : 'rgba(160,168,176,0.35)';
    for (const dx of [-w, 0, w]) {
      ctx.beginPath();
      ctx.ellipse(x + dx, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.filter = 'none';
}

// ---------- Сам мир ----------

export class BypassWorld {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ seed: number, ppm: number }} opts
   */
  constructor(scene, { seed, ppm }) {
    this.scene = scene;
    this.seed = seed >>> 0;
    this.ppm = ppm;
    // Полное разрешение экрана: мир 640×360 растянут на холст, и рисуем столько же точек,
    // сколько их на экране, — листва, трава и кора остаются мелкими и чёткими.
    // Размеры холстов чётные. Полушаг сохраняет целое число пикселей на всех
    // слоях: округление размеров браузером иначе оставляет щель на стыке.
    this.res = Phaser.Math.Clamp(Math.round(getRenderZoom() * 2) / 2, 1, 4);
    this.id = `bw${Math.floor(Math.random() * 1e9)}`;

    this.queue = [];

    const skyKey = `${this.id}_sky`;
    const c = document.createElement('canvas');
    c.width = VIEW_W * this.res;
    c.height = 240 * this.res;
    const ctx = c.getContext('2d');
    ctx.scale(this.res, this.res);
    drawSky(ctx, this.seed, VIEW_W, 240);
    scene.textures.addCanvas(skyKey, c).setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.sky = scene.add
      .tileSprite(0, 0, VIEW_W, 240, skyKey)
      .setOrigin(0)
      .setTileScale(1 / this.res);

    this.layers = LAYERS.map((spec) => ({
      spec,
      box: scene.add.container(0, 0),
      chunks: new Map(), // индекс → картинка
      objects: new Map(),
      jobs: new Map(), // начатые, ещё не дорисованные куски
    }));
    // Под дорогой до края экрана — тот же асфальт.
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    this.update(0, true);
  }

  /** Объекты куска с кешем. */
  #objects(layer, ci) {
    if (!layer.objects.has(ci)) {
      const list =
        layer.spec.id === 'road'
          ? roadObjects(this.seed, ci, this.ppm)
          : chunkObjects(this.seed, layer.spec, ci, this.ppm);
      layer.objects.set(ci, list);
    }
    return layer.objects.get(ci);
  }

  /** Начать кусок: холст, подложка и список объектов; рисуется потом по частям. */
  #start(layer, ci) {
    const { spec } = layer;
    const res = this.res;
    const c = document.createElement('canvas');
    c.width = CW * res;
    c.height = (spec.y1 - spec.y0) * res;
    // Программный холст: рисование идёт сразу и делится по кадрам. На видеокарте команды
    // копятся и исполняются разом при отдаче текстуры — это рывок в сотни миллисекунд.
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const x0 = ci * CW;
    ctx.setTransform(res, 0, 0, res, -x0 * res, -spec.y0 * res);
    if (spec.id === 'road') drawRoad(ctx, this.seed, x0, this.ppm);
    if (spec.id === 'far') {
      // Подложка дальнего леса.
      ctx.fillStyle = mix('#3b5040', 0.6);
      ctx.fillRect(x0, 212, CW, 22);
    }
    if (spec.id === 'mid') {
      // Глубина леса: чем гуще участок, тем темнее и выше тёмная стена за стволами.
      for (let x = x0; x < x0 + CW; x += 2) {
        const b = biomeAt(this.seed, x / (spec.k * this.ppm));
        const top =
          224 - (60 + 70 * Math.min(1, b.density)) * (0.85 + 0.15 * hash(this.seed, x >> 3, 71));
        const g = ctx.createLinearGradient(0, top, 0, 224);
        g.addColorStop(0, 'rgba(38,58,44,0)');
        const d = Math.min(1, b.density);
        g.addColorStop(0.35, 'rgba(34,52,40,' + 0.55 * d + ')');
        g.addColorStop(1, 'rgba(24,38,30,' + 0.9 * d + ')');
        ctx.fillStyle = g;
        ctx.fillRect(x, top, 2, 224 - top);
      }
      ctx.fillStyle = mix('#7a7a52', 0.15);
      ctx.fillRect(x0, 222, CW, 12);
    }
    const objs = [ci - 1, ci, ci + 1]
      .flatMap((i) => this.#objects(layer, i))
      .filter((o) => o.x + (o.w ?? 400) > x0 && o.x - (o.w ?? 400) < x0 + CW)
      .sort((a, b) => a.base - b.base || a.x - b.x);
    const job = { layer, ci, c, ctx, x0, objs, i: 0, ms: 0 };
    layer.jobs.set(ci, job);
    return job;
  }

  /** Дорисовать кусок до срока (performance.now()); true — готов. */
  #step(job, deadline) {
    const t0 = performance.now();
    const { ctx, objs } = job;
    while (job.i < objs.length) {
      const o = objs[job.i++];
      if (o.scale) {
        // Дальняя обочина дальше машины: столбики и знаки мельче.
        ctx.save();
        ctx.translate(o.x, o.base);
        ctx.scale(o.scale, o.scale);
        ctx.translate(-o.x, -o.base);
      }
      DRAW[o.kind]?.(ctx, { ...o, r: rand(o.seed ?? 1) });
      if (o.scale) ctx.restore();
      if (performance.now() > deadline) break;
    }
    job.ms += performance.now() - t0;
    if (job.i < objs.length) return false;
    this.#finish(job);
    return true;
  }

  #finish(job) {
    const { layer, ci, c, ctx, x0 } = job;
    const { spec } = layer;
    if (spec.id === 'far') {
      // Дымка у земли: дальний лес тонет в воздухе.
      const g = ctx.createLinearGradient(0, 160, 0, 232);
      g.addColorStop(0, 'rgba(200,206,208,0)');
      g.addColorStop(1, 'rgba(200,206,208,0.55)');
      ctx.fillStyle = g;
      ctx.fillRect(x0, 160, CW, 72);
    }
    const key = `${this.id}_${spec.id}_${ci}`;
    this.scene.textures.addCanvas(key, c).setFilter(Phaser.Textures.FilterMode.LINEAR);
    const img = this.scene.add
      .image(ci * CW, spec.y0, key)
      .setOrigin(0)
      .setScale(1 / this.res);
    layer.box.add(img);
    layer.chunks.set(ci, img);
    layer.jobs.delete(ci);
    this.stats ??= {};
    this.stats[spec.id] = Math.max(this.stats[spec.id] ?? 0, Math.round(job.ms));
  }

  /**
   * Кадр: сдвиг слоёв по метру дороги, подгрузка новых кусков и уборка ушедших.
   * @param {number} scroll путь машины в точках мира (run.x × PPM)
   * @param {boolean} [now] нарисовать всё нужное сразу (при создании сцены)
   */
  update(scroll, now = false) {
    const tu = performance.now();
    this.sky.tilePositionX = scroll * 0.02 * this.res;
    const pending = [];
    for (const layer of this.layers) {
      const s = scroll * layer.spec.k;
      layer.box.x = -s;
      const first = Math.floor(s / CW);
      const last = Math.floor((s + VIEW_W) / CW);
      for (let ci = first; ci <= last + 1; ci++) {
        if (layer.chunks.has(ci)) continue;
        const job = layer.jobs.get(ci) ?? this.#start(layer, ci);
        // На экране — дорисовать сразу; следующий кусок — заранее, по частям.
        if (ci <= last || now) this.#step(job, Infinity);
        else pending.push(job);
      }
      for (const ci of layer.objects.keys()) {
        if (ci < first - 2 || ci > last + 2) layer.objects.delete(ci);
      }
      for (const ci of layer.jobs.keys()) {
        if (ci < first - 1 || ci > last + 1) layer.jobs.delete(ci);
      }
      for (const [ci, img] of layer.chunks) {
        if (ci >= first - 1 && ci <= last + 1) continue;
        const key = img.texture.key;
        img.destroy();
        this.scene.textures.remove(key);
        layer.chunks.delete(ci);
      }
    }
    // Не больше ~5 мс фоновой отрисовки за кадр — без рывков на ходу.
    const deadline = performance.now() + 5;
    for (const job of pending) {
      if (performance.now() > deadline) break;
      this.#step(job, deadline);
    }
    this.stats ??= {};
    this.stats.update = Math.max(this.stats.update ?? 0, Math.round(performance.now() - tu));
  }

  destroy() {
    for (const layer of this.layers)
      for (const img of layer.chunks.values()) {
        const key = img.texture.key;
        img.destroy();
        this.scene.textures.remove(key);
      }
    this.scene.textures.remove(`${this.id}_sky`);
    this.layers = [];
  }
}
