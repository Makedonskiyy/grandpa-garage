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
DRAW.pole = pole;

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

/** Прямоугольник с вертикальным градиентом (объём у плоских деталей). */
function vgrad(ctx, x, y, w, h, top, bottom) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/** Тонкая линия-грань (кромка, шов). */
function edge(ctx, x0, y0, x1, y1, color, w = 0.4) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** Подтёки и пятна грязи/ржавчины на поверхности. */
function stains(ctx, r, x, y, w, h, color, n) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const sx = x + r() * w;
    const len = h * (0.15 + r() * 0.5);
    ctx.globalAlpha = 0.12 + r() * 0.18;
    ctx.fillRect(sx, y + r() * h * 0.3, 0.4 + r() * 1.2, len);
  }
  ctx.globalAlpha = 1;
}

/** Пучок травы у основания построек — вписывает их в обочину. */
function baseGrass(ctx, r, x0, x1, base) {
  const cols = ['#8f8b5c', '#a39a6a', '#7b8650', '#b6ab7d'];
  for (let x = x0; x < x1; x += 0.8 + r() * 1.6) {
    ctx.strokeStyle = cols[Math.floor(r() * cols.length)];
    ctx.lineWidth = 0.3 + r() * 0.3;
    const len = 2 + r() * 5;
    ctx.beginPath();
    ctx.moveTo(x, base + 1);
    ctx.lineTo(x + (r() - 0.5) * 2, base + 1 - len);
    ctx.stroke();
  }
}

/** Гравийный карман у дороги под сооружением: щебень, колея, лужица. */
function layby(ctx, x0, x1, base, r) {
  vgrad(ctx, x0, base - 3, x1 - x0, 6, '#938d7d', '#7d7769');
  for (let i = 0; i < (x1 - x0) * 2.2; i++) {
    const c = r();
    ctx.fillStyle = c < 0.35 ? '#a9a395' : c < 0.7 ? '#6c675b' : '#8a8475';
    const s = 0.4 + r() * 0.8;
    ctx.fillRect(x0 + r() * (x1 - x0), base - 3 + r() * 6, s, s * 0.7);
  }
  // Колея от колёс и лужица с отблеском неба.
  ctx.fillStyle = 'rgba(70,66,58,0.35)';
  ctx.fillRect(x0 + 6, base - 1.2, x1 - x0 - 12, 0.8);
  if (r() < 0.6) {
    const px = x0 + (x1 - x0) * (0.2 + r() * 0.6);
    ctx.fillStyle = '#6f6a5e';
    ctx.beginPath();
    ctx.ellipse(px, base + 0.5, 9, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b8c0c4';
    ctx.beginPath();
    ctx.ellipse(px, base + 0.3, 7.5, 1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function busStop(ctx, o) {
  const { x, base, r } = o;
  const w = 110;
  const hgt = 56;
  layby(ctx, x - 20, x + w + 40, base, r);
  // Бетонный цоколь.
  vgrad(ctx, x - 4, base - 4, w + 8, 4, '#9e998d', '#7f7a6f');
  // Задняя стена: бетон с тенью под крышей и подтёками.
  vgrad(ctx, x, base - hgt, w, hgt - 4, '#cfcabe', '#b8b3a6');
  stains(ctx, r, x, base - hgt, w, hgt, '#6d6559', 26);
  // Мозаика: мелкая плитка, сюжет — солнце над берёзами и волны.
  const mx0 = x + 6;
  const my0 = base - hgt + 9;
  const mw = w - 12;
  const mh = hgt - 24;
  const T = 1.6;
  for (let ty = 0; ty < mh; ty += T)
    for (let tx = 0; tx < mw; tx += T) {
      const u = tx / mw;
      const v = ty / mh;
      let c = '#e9e3d1'; // небо
      const sun = Math.hypot(u - 0.78, (v - 0.3) * 0.55);
      if (sun < 0.1) c = sun < 0.07 ? '#e8a23a' : '#efc25a';
      else if (v > 0.72 + 0.06 * Math.sin(u * 18))
        c = Math.floor(u * 22 + v * 4) % 2 ? '#2f6fb0' : '#3f82c4';
      else if (v > 0.5 + 0.08 * Math.sin(u * 7 + 1)) c = u < 0.55 ? '#3d8a5a' : '#4f9a64';
      // Стволы берёз слева.
      for (const bxu of [0.12, 0.2, 0.31])
        if (Math.abs(u - bxu) < 0.012 && v > 0.12)
          c = Math.floor(v * 14) % 3 ? '#f2efe6' : '#2a2a2a';
      ctx.fillStyle = c;
      ctx.fillRect(mx0 + tx, my0 + ty, T - 0.25, T - 0.25);
      // Выпавшие плитки.
      if (hash(7, Math.floor(tx * 3), Math.floor(ty * 3)) < 0.012) {
        ctx.fillStyle = '#a9a497';
        ctx.fillRect(mx0 + tx, my0 + ty, T, T);
      }
    }
  ctx.strokeStyle = '#8d887c';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(mx0 - 0.5, my0 - 0.5, mw + 1, mh + 1);
  // Расписание под стеклом и объявления.
  ctx.fillStyle = '#f4f1e8';
  ctx.fillRect(x + w - 22, base - 22, 12, 9);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#9a968c';
    ctx.fillRect(x + w - 21, base - 20.5 + i * 2, 10 - (i % 2) * 3, 0.5);
  }
  ctx.fillStyle = '#f2e9a8';
  ctx.fillRect(x + 8, base - 20, 6, 7);
  ctx.fillStyle = '#d9e4ef';
  ctx.fillRect(x + 15, base - 19, 5, 6);
  // Боковые стенки с проёмами.
  for (const sx of [x - 3, x + w - 2]) {
    vgrad(ctx, sx, base - hgt, 5, hgt - 4, '#bdb8ab', '#a29d90');
    ctx.fillStyle = 'rgba(40,40,40,0.25)';
    ctx.fillRect(sx + 1.2, base - hgt + 14, 2.6, 16);
  }
  // Плита крыши: толщина, свес, тень под ней, капли ржавчины с арматуры.
  vgrad(ctx, x - 10, base - hgt - 7, w + 20, 7, '#b4afa3', '#8f8a7e');
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x, base - hgt, w, 3);
  edge(ctx, x - 10, base - hgt - 7, x + w + 10, base - hgt - 7, '#cdc8bc', 0.5);
  stains(ctx, r, x - 10, base - hgt - 5, w + 20, 5, '#7a4a2a', 8);
  // Скамья из реек на металлических ножках.
  for (let i = 0; i < 3; i++) {
    vgrad(ctx, x + 14, base - 15 + i * 1.3, w - 28, 1, '#8a6544', '#6b4e36');
  }
  edge(ctx, x + 14, base - 15, x + w - 14, base - 15, '#a07a54', 0.3);
  for (const lx of [x + 18, x + w - 20]) {
    vgrad(ctx, lx, base - 11, 1.6, 11, '#5a5754', '#3f3d3b');
  }
  // Урна: бетонная, с ободом и мусором.
  vgrad(ctx, x + w + 8, base - 10, 8, 10, '#8d9a8d', '#5e6b5e');
  ctx.fillStyle = '#4b564b';
  ctx.fillRect(x + w + 7.5, base - 10.5, 9, 1.2);
  ctx.fillStyle = '#e9e5da';
  ctx.fillRect(x + w + 10, base - 11.4, 2, 1);
  // Знак остановки: столб с хомутами, табличка «А», название.
  const sx = x + w + 26;
  vgrad(ctx, sx - 0.8, base - 62, 1.8, 62, '#8e9196', '#6c6f74');
  ctx.fillStyle = '#5c5f64';
  ctx.fillRect(sx - 1.4, base - 58, 3, 1);
  ctx.fillRect(sx - 1.4, base - 45, 3, 1);
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
  ctx.strokeStyle = '#6c6f74';
  ctx.lineWidth = 0.4;
  ctx.strokeRect(sx - nw / 2, base - 47, nw, 8);
  text(ctx, name, sx, base - 42.8, 6, '#1b1b1d');
  baseGrass(ctx, r, x - 20, x - 4, base - 2);
  baseGrass(ctx, r, x + w + 18, x + w + 40, base - 2);
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
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx, base + 0.5, 9, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16171a';
    ctx.beginPath();
    ctx.arc(cx, base - 8, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a2b2f';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(cx, base - 8, 6.6, 0, Math.PI * 2);
    ctx.stroke();
    const g = ctx.createRadialGradient(cx - 1, base - 9, 0.5, cx, base - 8, 4.2);
    g.addColorStop(0, '#a3a7ad');
    g.addColorStop(1, '#5b5f65');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, base - 8, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a3d42';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.fillRect(cx + Math.cos(a) * 2.6 - 0.35, base - 8 + Math.sin(a) * 2.6 - 0.35, 0.7, 0.7);
    }
    ctx.fillStyle = '#26282c';
    ctx.beginPath();
    ctx.arc(cx, base - 8, 1, 0, Math.PI * 2);
    ctx.fill();
  };
  const tx0 = right ? x : x + 64;
  const cx0 = right ? x + L - 62 : x;
  const TW = 236;
  // Полуприцеп-тент: каркас, рёбра, стяжные ремни, складки тента, грязь снизу.
  vgrad(ctx, tx0, base - 92, TW, 74, trailer, mix(trailer, 0.25, '#6f7378'));
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(tx0, base - 92, TW, 2);
  for (let i = 0; i <= TW; i += 26) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(tx0 + i, base - 92, 1, 74);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(tx0 + i + 1, base - 92, 0.6, 74);
  }
  for (let i = 13; i < TW; i += 26) {
    ctx.fillStyle = 'rgba(40,40,40,0.35)';
    ctx.fillRect(tx0 + i, base - 92, 0.6, 74);
    ctx.fillStyle = '#7c7f84';
    ctx.fillRect(tx0 + i - 0.6, base - 23, 1.8, 2);
  }
  stains(ctx, r, tx0, base - 40, TW, 22, '#5a5246', 40);
  if (logo) {
    text(ctx, logo, tx0 + TW / 2, base - 58, 15, '#2f3a4a');
    ctx.fillStyle = '#c94a3a';
    ctx.fillRect(tx0 + TW / 2 - 50, base - 47, 100, 1.2);
  }
  // Рама, отбойник, фонари, брызговики.
  vgrad(ctx, tx0, base - 20, TW, 6, '#45484d', '#2b2d31');
  ctx.fillStyle = '#9da1a6';
  ctx.fillRect(tx0 + 90, base - 15, 80, 1.2);
  ctx.fillRect(tx0 + 90, base - 12, 80, 1.2);
  const rear = right ? tx0 : tx0 + TW - 4;
  ctx.fillStyle = '#c8202a';
  ctx.fillRect(rear, base - 22, 4, 2.5);
  ctx.fillStyle = '#e59a2a';
  ctx.fillRect(rear, base - 19.5, 4, 1.5);
  for (const k of [30, 50, 70]) wheel(right ? tx0 + k : tx0 + TW - k);
  ctx.fillStyle = '#1e1f22';
  ctx.fillRect(right ? tx0 + 80 : tx0 + TW - 84, base - 14, 3, 11);
  // Тягач: рама, топливный бак, ступени.
  vgrad(ctx, cx0, base - 22, 62, 8, '#3a3c40', '#232427');
  vgrad(ctx, right ? cx0 + 20 : cx0 + 24, base - 19, 18, 7, '#c9ccd0', '#8e9196');
  edge(
    ctx,
    right ? cx0 + 20 : cx0 + 24,
    base - 15.5,
    right ? cx0 + 38 : cx0 + 42,
    base - 15.5,
    '#70737a',
  );
  // Кабина: задняя стенка — у полуприцепа, передок — на краю тягача (в любую сторону).
  const fx = right ? cx0 + 62 : cx0;
  const bx = right ? cx0 + 8 : cx0 + 54;
  const dir = right ? 1 : -1;
  const g = ctx.createLinearGradient(bx, 0, fx, 0);
  g.addColorStop(0, mix(cabCol, 0.2, '#000000'));
  g.addColorStop(0.7, cabCol);
  g.addColorStop(1, mix(cabCol, 0.15, '#ffffff'));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(bx, base - 18);
  ctx.lineTo(bx, base - 84);
  ctx.lineTo(fx - dir * 4, base - 84);
  ctx.lineTo(fx, base - 70);
  ctx.lineTo(fx, base - 18);
  ctx.closePath();
  ctx.fill();
  // Спойлер на крыше.
  ctx.fillStyle = mix(cabCol, 0.12, '#ffffff');
  ctx.beginPath();
  ctx.moveTo(bx, base - 84);
  ctx.lineTo(bx, base - 92);
  ctx.lineTo(fx - dir * 14, base - 86);
  ctx.lineTo(fx - dir * 8, base - 84);
  ctx.closePath();
  ctx.fill();
  // Дверь, ручка, ступени.
  const dx0 = right ? fx - 30 : fx + 8;
  ctx.strokeStyle = mix(cabCol, 0.35, '#000000');
  ctx.lineWidth = 0.5;
  ctx.strokeRect(dx0, base - 80, 22, 52);
  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(right ? dx0 + 3 : dx0 + 15, base - 52, 4, 1);
  for (let i = 0; i < 2; i++) ctx.fillRect(dx0 + 4, base - 24 + i * 4, 14, 1.4);
  // Окна: лобовое и боковое, блик.
  ctx.fillStyle = '#7f95a6';
  ctx.fillRect(right ? fx - 22 : fx + 4, base - 78, 18, 18);
  const wg = ctx.createLinearGradient(0, base - 78, 0, base - 60);
  wg.addColorStop(0, 'rgba(255,255,255,0.4)');
  wg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = wg;
  ctx.fillRect(right ? fx - 22 : fx + 4, base - 78, 18, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(right ? fx - 20 : fx + 6, base - 76, 4, 14);
  ctx.fillStyle = '#5f7383';
  ctx.fillRect(right ? bx + 2 : bx - 12, base - 78, 10, 14);
  // Зеркало на кронштейне.
  // Кронштейн идёт от стойки кабины назад-вбок, зеркало прижато к лобовому краю.
  const mx = right ? fx - 3 : fx + 1;
  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(mx, base - 75, 2, 0.8);
  vgrad(ctx, mx + 0.2, base - 80, 1.6, 7, '#3a3c40', '#1f2023');
  ctx.fillStyle = 'rgba(160,180,195,0.6)';
  ctx.fillRect(mx + 0.6, base - 79.4, 0.6, 5.8);
  // Решётка, фары, бампер, номер.
  ctx.fillStyle = '#2a2b2f';
  for (let i = 0; i < 5; i++) ctx.fillRect(right ? fx - 2 : fx, base - 52 + i * 3, 2, 1.4);
  ctx.fillStyle = '#f3efd8';
  ctx.fillRect(right ? fx - 2.4 : fx, base - 34, 2.4, 4);
  ctx.fillStyle = '#e59a2a';
  ctx.fillRect(right ? fx - 2.4 : fx, base - 29.5, 2.4, 1.5);
  vgrad(ctx, right ? fx - 3 : fx - 1, base - 26, 4, 8, '#5a5d62', '#2e3034');
  ctx.fillStyle = '#f2f0ea';
  ctx.fillRect(right ? fx - 1 : fx - 1, base - 24, 2, 3);
  // Грязь по низу кабины.
  stains(ctx, r, Math.min(bx, fx), base - 34, Math.abs(fx - bx), 14, '#5a5246', 18);
  wheel(right ? cx0 + 46 : cx0 + 16);
  wheel(right ? cx0 + 14 : cx0 + 48);
}

function billboard(ctx, o) {
  const { x, base, r } = o;
  const [title, sub, col] = pick(r, ADS);
  // Опоры-фермы: две трубы с раскосами.
  for (const px of [x + 20, x + 95]) {
    vgrad(ctx, px, base - 70, 3, 70, '#6d7176', '#4f5257');
    edge(ctx, px + 0.6, base - 70, px + 0.6, base, '#8a8e93', 0.4);
  }
  for (let y = base - 66; y < base - 6; y += 14) {
    edge(ctx, x + 23, y, x + 95, y + 12, '#5d6166', 0.6);
    edge(ctx, x + 95, y, x + 23, y + 12, '#5d6166', 0.6);
  }
  // Мостик обслуживания и прожекторы.
  ctx.fillStyle = '#4f5257';
  ctx.fillRect(x - 2, base - 66, 122, 1.4);
  for (let i = 0; i < 12; i++) ctx.fillRect(x - 2 + i * 11, base - 66, 0.5, -4);
  ctx.fillRect(x - 2, base - 70, 122, 0.5);
  for (const lx of [x + 25, x + 59, x + 93]) {
    ctx.fillStyle = '#3c3f43';
    ctx.fillRect(lx, base - 64.6, 0.8, 4);
    ctx.fillRect(lx - 2, base - 61, 5, 2.4);
  }
  // Щит: рама, полотно с выцветанием, отклеившийся угол.
  ctx.fillStyle = '#3a3d41';
  ctx.fillRect(x - 2, base - 114, 122, 50);
  vgrad(ctx, x, base - 112, 118, 46, '#f3efe4', '#e2ddd0');
  ctx.fillStyle = col;
  ctx.fillRect(x, base - 112, 118, 8);
  ctx.fillRect(x, base - 74, 118, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x, base - 112, 118, 2);
  text(ctx, title, x + 59, base - 94, 10, '#1d1d1f');
  text(ctx, sub, x + 59, base - 82, 7, '#3a3a3c');
  // Шов листов плаката и потёки.
  for (const sx of [x + 39, x + 79])
    edge(ctx, sx, base - 112, sx, base - 66, 'rgba(0,0,0,0.12)', 0.4);
  stains(ctx, r, x, base - 104, 118, 38, '#6d6559', 14);
  if (r() < 0.6) {
    const cx = r() < 0.5 ? x + 112 : x;
    ctx.fillStyle = '#c9c3b4';
    ctx.beginPath();
    ctx.moveTo(cx, base - 66);
    ctx.lineTo(cx + (cx === x ? 7 : 6), base - 66);
    ctx.lineTo(cx + (cx === x ? 0 : 6), base - 73);
    ctx.closePath();
    ctx.fill();
  }
  baseGrass(ctx, r, x + 14, x + 30, base);
  baseGrass(ctx, r, x + 88, x + 104, base);
}

function honeyStand(ctx, o) {
  const { x, base, r } = o;
  layby(ctx, x - 10, x + 74, base, r);
  // Пляжный зонт: полосатый купол, спицы, стойка.
  vgrad(ctx, x + 30, base - 52, 1.4, 52, '#8a8e93', '#5c6064');
  const c1 = pick(r, ['#c94a3a', '#2f6fb0', '#3d8a5a']);
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const a0 = Math.PI + (i / segs) * Math.PI;
    const a1 = Math.PI + ((i + 1) / segs) * Math.PI;
    ctx.fillStyle = i % 2 ? '#f2efe6' : c1;
    ctx.beginPath();
    ctx.moveTo(x + 31, base - 58);
    ctx.lineTo(x + 31 + Math.cos(a0) * 26, base - 48 + Math.sin(a0) * 4);
    ctx.lineTo(x + 31 + Math.cos(a1) * 26, base - 48 + Math.sin(a1) * 4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(x + 5, base - 48.5, 52, 1);
  // Стол со скатертью.
  ctx.fillStyle = '#7a5a3e';
  ctx.fillRect(x + 10, base - 17, 2, 17);
  ctx.fillRect(x + 50, base - 17, 2, 17);
  vgrad(ctx, x + 7, base - 21, 48, 7, '#f0ece2', '#d8d2c4');
  for (let i = 0; i < 48; i += 4) {
    ctx.fillStyle = 'rgba(201,74,58,0.55)';
    ctx.fillRect(x + 7 + i, base - 21, 2, 7);
  }
  // Банки мёда (просвечивают), варенье, крышки; корзинка грибов.
  for (let i = 0; i < 6; i++) {
    const jx = x + 11 + i * 6.6;
    const honey = i % 3 !== 2;
    const g = ctx.createLinearGradient(jx, 0, jx + 5, 0);
    g.addColorStop(0, honey ? '#e7a93a' : '#8e2a3c');
    g.addColorStop(1, honey ? '#b6741c' : '#5e1726');
    ctx.fillStyle = g;
    ctx.fillRect(jx, base - 29, 5, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(jx + 0.8, base - 28, 0.8, 6);
    ctx.fillStyle = i % 2 ? '#d8c66a' : '#e8e2d2';
    ctx.fillRect(jx - 0.3, base - 30.4, 5.6, 1.6);
  }
  vgrad(ctx, x + 43, base - 27, 10, 5, '#a07a4a', '#7a5a34');
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#8a5a34';
    ctx.beginPath();
    ctx.ellipse(x + 45 + i * 2.2, base - 27.5, 1.4, 0.9, 0, Math.PI, 0);
    ctx.fill();
  }
  // Табличка на картоне.
  ctx.fillStyle = '#c9a676';
  ctx.fillRect(x + 12, base - 41, 30, 10);
  ctx.fillStyle = '#e8dcc0';
  ctx.fillRect(x + 12.6, base - 40.4, 28.8, 8.8);
  text(ctx, 'МЁД · ГРИБЫ', x + 27, base - 36, 5, '#3a2a1a');
  // Бабушка на табуретке: валенки, юбка, телогрейка, платок с узором.
  const bx = x + 64;
  ctx.fillStyle = '#6b4e36';
  ctx.fillRect(bx - 5, base - 9, 10, 1.2);
  ctx.fillRect(bx - 4, base - 8, 1, 8);
  ctx.fillRect(bx + 3, base - 8, 1, 8);
  ctx.fillStyle = '#3a3634';
  ctx.fillRect(bx - 4, base - 4, 3, 4);
  ctx.fillRect(bx + 1, base - 4, 3, 4);
  vgrad(ctx, bx - 5, base - 14, 10, 6, '#3a4a6a', '#2c3a55');
  vgrad(ctx, bx - 5, base - 23, 10, 10, '#5a4a3a', '#43372b');
  for (let i = 0; i < 4; i++)
    edge(ctx, bx - 5, base - 21 + i * 2.2, bx + 5, base - 21 + i * 2.2, '#3a2f25', 0.3);
  ctx.fillStyle = '#d6b49a';
  ctx.beginPath();
  ctx.arc(bx, base - 26.5, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b0262c';
  ctx.beginPath();
  ctx.moveTo(bx - 4.2, base - 25);
  ctx.quadraticCurveTo(bx, base - 33, bx + 4.2, base - 25);
  ctx.lineTo(bx + 1.5, base - 22.5);
  ctx.lineTo(bx - 1.5, base - 22.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f2d36a';
  for (let i = 0; i < 5; i++) ctx.fillRect(bx - 3 + i * 1.4, base - 28 + (i % 2), 0.6, 0.6);
}

function farHouses(ctx, o) {
  const { x, base, r, haze } = o;
  for (let i = 0; i < 4; i++) {
    const hx = x + i * 18 + r() * 6;
    const w = 12 + r() * 6;
    const wall = pick(r, ['#8a6a4e', '#6f7f8f', '#9a8a6a', '#7a8a6a']);
    vgrad(ctx, hx, base - 9, w, 9, mix(wall, haze), mix(wall, Math.min(1, haze + 0.1), '#3a3a3a'));
    ctx.fillStyle = mix(pick(r, ['#5a5f66', '#7a3b30', '#4a6a5a']), haze);
    ctx.beginPath();
    ctx.moveTo(hx - 1, base - 9);
    ctx.lineTo(hx + w / 2, base - 15);
    ctx.lineTo(hx + w + 1, base - 9);
    ctx.closePath();
    ctx.fill();
    // Окна с наличниками, труба с дымком, забор.
    for (let k = 0; k < 2; k++) {
      ctx.fillStyle = mix('#e8e2d2', haze);
      ctx.fillRect(hx + 2 + k * (w / 2), base - 7, 3, 3);
      ctx.fillStyle = mix('#3b4a5a', haze);
      ctx.fillRect(hx + 2.5 + k * (w / 2), base - 6.5, 2, 2);
    }
    ctx.fillStyle = mix('#6a4a3a', haze);
    ctx.fillRect(hx + w * 0.7, base - 15, 1.4, 3);
    if (r() < 0.5) {
      ctx.fillStyle = 'rgba(220,222,224,0.45)';
      ctx.beginPath();
      ctx.ellipse(hx + w * 0.7 + 2, base - 18, 2.4, 1.4, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let k = 0; k < w + 6; k += 1.6) {
      ctx.fillStyle = mix('#7a6a52', haze);
      ctx.fillRect(hx - 3 + k, base - 3, 0.5, 3);
    }
  }
}

function hayBale(ctx, o) {
  const { x, base, haze, r } = o;
  const g = ctx.createRadialGradient(x - 2, base - 7, 1, x, base - 5, 6.5);
  g.addColorStop(0, mix('#d2b874', haze));
  g.addColorStop(1, mix('#9a7f45', haze));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, base - 5, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Спираль рулона и торчащая солома.
  ctx.strokeStyle = mix('#8c7440', haze);
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 6; a += 0.2) {
    const rr = 0.4 + a * 0.22;
    const px = x + Math.cos(a) * rr;
    const py = base - 5 + Math.sin(a) * rr * 0.85;
    if (a === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.strokeStyle = mix('#c8ad6a', haze);
  for (let i = 0; i < 14; i++) {
    const a = (r ? r() : Math.random()) * Math.PI * 2;
    edge(
      ctx,
      x + Math.cos(a) * 5.6,
      base - 5 + Math.sin(a) * 4.6,
      x + Math.cos(a) * 6.8,
      base - 5 + Math.sin(a) * 5.6,
      mix('#c8ad6a', haze),
      0.3,
    );
  }
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(x + 1, base + 0.2, 6, 1, 0, 0, Math.PI * 2);
  ctx.fill();
}

Object.assign(DRAW, { busStop, truck, billboard, honeyStand, farHouses, hayBale });

// ---------- Поле ----------

const POLE_STEP = 260;
const polePos = (seed, n) => n * POLE_STEP + hash(seed, n, 31) * 30;

/** Горизонт: светлая дымка над землёй и тонкая неровная полоса далёкого леса. */
function drawHorizon(ctx, seed, x0) {
  const g = ctx.createLinearGradient(0, 168, 0, 190);
  g.addColorStop(0, 'rgba(200,206,210,0)');
  g.addColorStop(1, 'rgba(176,184,182,0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, 168, CW, 22);
  // Полоса далёкого леса: где есть, где нет, высотой 1–4 точки.
  for (let x = x0; x < x0 + CW; x += 1) {
    const band = hash(seed, Math.floor(x / 90), 501);
    if (band < 0.45) continue;
    const hgt = 1 + Math.round(hash(seed, x, 502) * 2 + band * 2);
    ctx.fillStyle = hash(seed, x, 503) < 0.5 ? '#7d8a84' : '#738079';
    ctx.fillRect(x, 186 - hgt, 1, hgt);
  }
  ctx.fillStyle = '#a3a68c';
  ctx.fillRect(x0, 186, CW, 4);
}

/** Поле до самой обочины: полосы сухой жёлтой травы и зелёного луга, мелкая штриховка. */
function drawField(ctx, seed, x0) {
  const wave = (x, len, salt) => {
    const i = Math.floor(x / len);
    const t = x / len - i;
    const u = t * t * (3 - 2 * t);
    return hash(seed, i, salt) * (1 - u) + hash(seed, i + 1, salt) * u;
  };
  const dry = [208, 192, 140];
  const green = [146, 156, 104];
  for (let x = x0; x < x0 + CW; x += 2) {
    // Доля луга меняется вдоль дороги — участки сухой травы и зелени.
    const t = wave(x, 260, 610);
    for (let y = 188; y < 234; y += 2) {
      const depth = (y - 188) / 46; // ближе к дороге — темнее и насыщеннее
      const v = hash(seed, x, y, 611);
      const k = Math.min(1, Math.max(0, t + (v - 0.5) * 0.35 + (depth - 0.5) * 0.2));
      const c = dry.map((d, i) => Math.round((d + (green[i] - d) * k) * (1 - depth * 0.18)));
      ctx.fillStyle = 'rgb(' + c.join(',') + ')';
      ctx.fillRect(x, y, 2, 2);
    }
  }
  // Горизонтальные полосы — колеи и межи поля.
  for (let i = 0; i < 4; i++) {
    const y = 192 + Math.round(hash(seed, x0, i, 620) * 34);
    ctx.fillStyle = 'rgba(120,110,80,0.25)';
    ctx.fillRect(x0, y, CW, 1);
  }
}

/** Деревянная опора ЛЭП с траверсой и изоляторами. */
function pole(ctx, o) {
  const { x, base } = o;
  const top = base - 120;
  ctx.fillStyle = '#5a4c3e';
  ctx.fillRect(Math.round(x) - 1, top, 3, base - top);
  ctx.fillStyle = '#7a6a58';
  ctx.fillRect(Math.round(x) - 1, top, 1, base - top);
  ctx.fillStyle = '#4a3f34';
  ctx.fillRect(Math.round(x) - 9, top + 6, 19, 2);
  ctx.fillStyle = '#d8d8d2';
  for (const dx of [-8, 0, 8]) ctx.fillRect(Math.round(x) + dx, top + 3, 1, 3);
}

// ---------- Генерация объектов по кускам ----------

/** Объекты куска ci слоя: { kind, x, base, h, haze, seed, w (размах для отбора) }. */
function chunkObjects(seed, layer, ci, ppm) {
  const r = rand(hash(seed, ci, layer.id.length * 991 + layer.id.charCodeAt(0)) * 2 ** 32);
  const x0 = ci * CW;
  const list = [];
  const meterOf = (x) => x / (layer.k * ppm);
  const add = (kind, x, base, h, haze, w) =>
    list.push({ kind, x, base, h, haze, w, seed: Math.floor(r() * 2 ** 31) });
  /**
   * Рощи: деревья растут группами вокруг центров, между группами — просветы.
   * Центры раскиданы по своей сетке (по сиду), поэтому соседние куски видят одни и те же рощи.
   */
  const groves = (cell, salt, fn) => {
    for (let n = Math.floor(x0 / cell) - 1; n * cell < x0 + CW + cell; n++) {
      const gr = rand(hash(seed, n, salt) * 2 ** 32);
      const cx = n * cell + gr() * cell;
      fn(cx, gr, n);
    }
  };
  const inChunk = (x) => x >= x0 && x < x0 + CW;

  if (layer.id === 'far') {
    // Вдали — редкие кусты и одинокие деревья у кромки поля, мелкие и в дымке.
    for (let x = x0; x < x0 + CW; x += 60 + r() * 140)
      if (r() < 0.35) add(r() < 0.5 ? 'birch' : 'bush', x, 186 + r() * 3, 8 + r() * 10, 0.55, 12);
  } else if (layer.id === 'mid') {
    // Поле: одинокие деревья и кусты — редко, по одному-два.
    groves(320, 21, (cx, gr) => {
      if (gr() > 0.45 || !inChunk(cx)) return;
      const tree = gr() < 0.55;
      const n = tree && gr() < 0.4 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const x = cx + i * (8 + gr() * 10);
        const h = tree ? 26 + gr() * 18 : 9 + gr() * 8;
        list.push({
          kind: tree ? 'birch' : 'bush',
          x,
          base: 200 + gr() * 10,
          h,
          haze: 0.3,
          w: 30,
          seed: Math.floor(gr() * 2 ** 31),
        });
      }
    });
  } else if (layer.id === 'back') {
    // Сооружения — редкие, в своих «окнах» по 6 кусков.
    const slot = Math.floor(ci / 16);
    const rs = rand(hash(seed, slot, 4242) * 2 ** 32);
    const at = slot * 16 + Math.floor(rs() * 16);
    if (at === ci && rs() < 0.45) {
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
    // Луг между дорогой и лесом: сухая трава и редкий подрост — ёлочки, сосенки, кусты.
    for (let x = x0; x < x0 + CW; x += 2 + r() * 4)
      add('grass', x, 229 + r() * 2, 6 + r() * 10, 0.1, 8);
    groves(110, 31, (cx, gr) => {
      const b = biomeAt(seed, meterOf(cx));
      if (gr() > 0.35 + b.density * 0.3) return;
      for (let i = 0; i < 1 + Math.floor(gr() * 3); i++) {
        const x = cx + (gr() - 0.5) * 40;
        if (!inChunk(x)) continue;
        const kind = 'bush'; // в поле у дороги — только кусты
        const h =
          kind === 'bush' ? 10 + gr() * 14 : kind === 'pine' ? 40 + gr() * 30 : 22 + gr() * 36;
        list.push({ kind, x, base: 230, h, haze: 0.08, w: 30, seed: Math.floor(gr() * 2 ** 31) });
      }
    });
  } else if (layer.id === 'near') {
    // Опоры ЛЭП вдоль поля — по одной на ~260 точек; провода рисуются в #finish.
    for (let n = Math.floor(x0 / POLE_STEP); n * POLE_STEP < x0 + CW; n++) {
      const px = polePos(seed, n);
      if (px >= x0 && px < x0 + CW) add('pole', px, 228, 0, 0.04, 20);
    }
    // Бурьян у обочины — редкими пучками.
    for (let x = x0; x < x0 + CW; x += 14 + r() * 30)
      if (r() < 0.6) add('grass', x, 233, 6 + r() * 10, 0.05, 8);
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

/** Сигнальный столбик: пластиковый, белый, чёрная косая полоса, световозвращатель, грязь снизу. */
function post(ctx, o) {
  const { x, base } = o;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x + 1, base, 5, 1, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createLinearGradient(x - 3, 0, x + 3, 0);
  g.addColorStop(0, '#fbfaf6');
  g.addColorStop(0.55, '#ecebe5');
  g.addColorStop(1, '#bdbbb3');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - 3, base);
  ctx.lineTo(x + 3, base);
  ctx.lineTo(x + 3, base - 60);
  ctx.quadraticCurveTo(x, base - 63.5, x - 3, base - 60);
  ctx.closePath();
  ctx.fill();
  // Чёрная полоса под углом и прямоугольный световозвращатель на ней.
  ctx.fillStyle = '#18181a';
  ctx.beginPath();
  ctx.moveTo(x - 3, base - 45);
  ctx.lineTo(x + 3, base - 49);
  ctx.lineTo(x + 3, base - 39);
  ctx.lineTo(x - 3, base - 35);
  ctx.closePath();
  ctx.fill();
  const rg = ctx.createLinearGradient(0, base - 46, 0, base - 41);
  rg.addColorStop(0, '#fff5d8');
  rg.addColorStop(1, '#d8c79a');
  ctx.fillStyle = rg;
  ctx.fillRect(x - 1, base - 46.5, 2, 5);
  // Брызги грязи у земли и потёртости.
  const r = rand(Math.floor(x * 13));
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = `rgba(90,80,66,${0.15 + r() * 0.3})`;
    ctx.fillRect(x - 3 + r() * 6, base - r() ** 2 * 14, 0.6 + r() * 0.8, 0.5);
  }
  edge(ctx, x - 2.6, base - 59, x - 2.6, base - 2, 'rgba(255,255,255,0.6)', 0.4);
}

/** Километровый столб: табличка с рамкой и цифрами на трубе с хомутами. */
function kmPost(ctx, o) {
  const { x, base, km } = o;
  vgrad(ctx, x - 0.9, base - 44, 1.8, 44, '#909398', '#64676c');
  ctx.fillStyle = '#55585d';
  ctx.fillRect(x - 1.5, base - 41, 3, 1);
  ctx.fillRect(x - 1.5, base - 38, 3, 1);
  ctx.fillStyle = '#3a3d41';
  ctx.fillRect(x - 10.6, base - 52.6, 21.2, 15.2);
  vgrad(ctx, x - 10, base - 52, 20, 14, '#fbfaf6', '#e6e4dc');
  ctx.strokeStyle = '#1b1b1d';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(x - 9, base - 51, 18, 12);
  text(ctx, String(km), x, base - 45, 9, '#1b1b1d');
  ctx.fillStyle = '#8a8e93';
  for (const dx of [-8.6, 8.6]) ctx.fillRect(x + dx - 0.4, base - 50.6, 0.8, 0.8);
}

/** Тыльная окантовка и болты знака на стойке. */
function signBolts(ctx, x, y) {
  ctx.fillStyle = '#5c5f64';
  ctx.fillRect(x - 1.6, y - 0.6, 3.2, 1.2);
  ctx.fillStyle = '#b8bcc0';
  ctx.fillRect(x - 0.4, y - 0.4, 0.8, 0.8);
}

function roadSign(ctx, o) {
  const { x, base, sign } = o;
  const pole = (px, top) => {
    vgrad(ctx, px - 0.9, top, 1.8, base - top, '#9a9da2', '#696c71');
    edge(ctx, px - 0.5, top, px - 0.5, base, 'rgba(255,255,255,0.35)', 0.3);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(px + 1, base, 3, 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  if (sign === 'elk') {
    pole(x, base - 70);
    signBolts(ctx, x, base - 74);
    // Треугольник: тёмный кант, красная кайма, белое поле со световозвращающей плёнкой.
    const tri = (h, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, base - 68 - h);
      ctx.lineTo(x + h * 0.6, base - 68 + h * 0.04);
      ctx.lineTo(x - h * 0.6, base - 68 + h * 0.04);
      ctx.closePath();
      ctx.fill();
    };
    tri(25, '#4a4d52');
    tri(24, '#c8202a');
    const wg = ctx.createLinearGradient(0, base - 88, 0, base - 70);
    wg.addColorStop(0, '#ffffff');
    wg.addColorStop(1, '#e6e4dc');
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.moveTo(x, base - 87);
    ctx.lineTo(x + 10.4, base - 70.6);
    ctx.lineTo(x - 10.4, base - 70.6);
    ctx.closePath();
    ctx.fill();
    // Лось: туловище с горбом, ноги, шея, морда, рога-лопаты.
    ctx.fillStyle = '#1b1b1d';
    ctx.beginPath();
    ctx.moveTo(x - 5.5, base - 76);
    ctx.quadraticCurveTo(x - 5, base - 79.5, x - 1, base - 79.6);
    ctx.quadraticCurveTo(x + 1.5, base - 80.5, x + 3, base - 79);
    ctx.lineTo(x + 3, base - 76);
    ctx.closePath();
    ctx.fill();
    for (const lx of [x - 5, x - 3.8, x + 1.4, x + 2.6]) ctx.fillRect(lx, base - 76.2, 0.7, 4);
    ctx.beginPath();
    ctx.moveTo(x + 2.4, base - 79);
    ctx.lineTo(x + 4.4, base - 82);
    ctx.lineTo(x + 6.6, base - 80.6);
    ctx.lineTo(x + 6.2, base - 79.6);
    ctx.lineTo(x + 4.2, base - 79.8);
    ctx.lineTo(x + 3.2, base - 77.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x + 2.6, base - 84, 0.6, 2.2);
    ctx.fillRect(x + 2, base - 84.4, 2.2, 0.6);
    ctx.fillRect(x + 4.2, base - 84.6, 0.6, 2.4);
    ctx.fillRect(x + 3.6, base - 85, 2.4, 0.6);
  } else if (sign === 'speed') {
    pole(x, base - 70);
    signBolts(ctx, x, base - 74);
    ctx.fillStyle = '#4a4d52';
    ctx.beginPath();
    ctx.arc(x, base - 80, 12.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c8202a';
    ctx.beginPath();
    ctx.arc(x, base - 80, 12, 0, Math.PI * 2);
    ctx.fill();
    const wg = ctx.createRadialGradient(x - 3, base - 83, 1, x, base - 80, 9);
    wg.addColorStop(0, '#ffffff');
    wg.addColorStop(1, '#e6e4dc');
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.arc(x, base - 80, 9, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, String(o.limit ?? 90), x, base - 80, 9, '#1b1b1d');
  } else {
    pole(x, base - 70);
    pole(x + 40, base - 70);
    for (const px of [x, x + 40]) {
      signBolts(ctx, px, base - 96);
      signBolts(ctx, px, base - 74);
    }
    // Синий указатель: тёмный торец, белая рамка, стрелки направлений.
    ctx.fillStyle = '#123873';
    ctx.fillRect(x - 12.6, base - 100.6, 67.2, 31.2);
    vgrad(ctx, x - 12, base - 100, 66, 30, '#2259b0', '#1a4892');
    ctx.strokeStyle = '#f2f0ea';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x - 10.5, base - 98.5, 63, 27);
    text(ctx, 'Москва 112', x - 6, base - 91, 7, '#f2f0ea', 'left');
    text(ctx, 'Тверь 48', x - 6, base - 80, 7, '#f2f0ea', 'left');
    ctx.fillStyle = '#f2f0ea';
    for (const [ay, flip] of [
      [-91, 1],
      [-80, -1],
    ]) {
      const ax = x + 46;
      ctx.beginPath();
      ctx.moveTo(ax + flip * 3, base + ay);
      ctx.lineTo(ax - flip * 1, base + ay - 2.4);
      ctx.lineTo(ax - flip * 1, base + ay + 2.4);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(Math.min(ax - flip * 4, ax - flip * 1), base + ay - 0.6, 3, 1.2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x - 12, base - 100, 66, 6);
  }
}

Object.assign(DRAW, { post, km: kmPost, sign: roadSign });

// ---------- Небо ----------

function drawSky(ctx, seed, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#c4cacf');
  g.addColorStop(0.6, '#d9dcde');
  g.addColorStop(1, '#e4e5e4');
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
    if (spec.id === 'far') drawHorizon(ctx, this.seed, x0);
    if (spec.id === 'mid') drawField(ctx, this.seed, x0);
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
    if (spec.id === 'near') {
      ctx.strokeStyle = 'rgba(50,52,56,0.8)';
      ctx.lineWidth = 0.5;
      for (let n = Math.floor(x0 / POLE_STEP) - 1; n * POLE_STEP < x0 + CW + POLE_STEP; n++) {
        const a = polePos(this.seed, n);
        const b = polePos(this.seed, n + 1);
        for (const dx of [-8, 0, 8]) {
          ctx.beginPath();
          ctx.moveTo(a + dx, 228 - 117);
          ctx.quadraticCurveTo((a + b) / 2 + dx, 228 - 105, b + dx, 228 - 117);
          ctx.stroke();
        }
      }
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

/**
 * Нарисовать один объект мира на холсте (витрина объектов для проверки арта).
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} kind имя объекта: busStop, truck, billboard, honeyStand, post, km, sign…
 * @param {object} o x, base и параметры объекта (seed, name, sign, km)
 */
export function drawProp(ctx, kind, o) {
  DRAW[kind]?.(ctx, { h: 0, haze: 0, ...o, r: rand(o.seed ?? 1) });
}
