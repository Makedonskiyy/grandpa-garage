#!/usr/bin/env node
/**
 * pixelize — заготовка пиксель-арта из обычной картинки (фото, рендер, эскиз).
 *
 * Что делает:
 *   1. Обрезает и уменьшает картинку до «пиксельного» разрешения (ширина / pixel).
 *   2. Убирает шум (медианный фильтр), поднимает контраст и насыщенность.
 *   3. Сводит цвета к ограниченной палитре без дизеринга (никакой «сеточки»).
 *   4. Чистит одиночные пиксели-соринки (их заменяет преобладающий соседний цвет).
 *   5. Увеличивает обратно без сглаживания (nearest) до итогового размера.
 *
 * Важно: это заготовка. Фоны из фото обычно годятся сразу, спрайты (машины, предметы)
 * после скрипта дорабатываются руками в LibreSprite / Pixelorama / Aseprite.
 *
 * Примеры:
 *   npm run pixelize -- art/source/menu_garage.jpg public/assets/images/bg/menu_garage.png
 *   npm run pixelize -- in.png out.png --pixel 2 --colors 40 --save-palette art/palette.json
 *   npm run pixelize -- car.png car.png --width 280 --height 90 --fit contain --palette art/palette.json
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    width: { type: 'string', default: '640' },
    height: { type: 'string', default: '360' },
    pixel: { type: 'string', default: '2' }, // размер «пикселя» арта в пикселях игры
    colors: { type: 'string', default: '32' },
    fit: { type: 'string', default: 'cover' }, // cover — обрезать, contain — вписать с прозрачностью
    position: { type: 'string', default: 'centre' }, // centre | north | south | east | west …
    denoise: { type: 'string', default: '0' }, // медианный фильтр: 0 — выкл., 3, 5…
    sharpen: { type: 'string', default: '1' }, // резкость после уменьшения: 0 — выкл.
    saturation: { type: 'string', default: '1.15' },
    brightness: { type: 'string', default: '1.0' },
    contrast: { type: 'string', default: '1.1' },
    cleanup: { type: 'string', default: '1' }, // проходов чистки одиночных пикселей
    palette: { type: 'string' }, // JSON-палитра игры: ["#rrggbb", …]
    'save-palette': { type: 'string' }, // сохранить получившуюся палитру
    help: { type: 'boolean', short: 'h' },
  },
});

if (opt.help || positionals.length < 2) {
  console.log(
    readFileSync(new URL(import.meta.url))
      .toString()
      .split('*/')[0],
  );
  process.exit(positionals.length < 2 && !opt.help ? 1 : 0);
}

const [input, output] = positionals;
const W = Number(opt.width);
const H = Number(opt.height);
const P = Number(opt.pixel);
const w = Math.round(W / P);
const h = Math.round(H / P);

const hexToRgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = ([r, g, b]) => '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);

// 1–2. Уменьшение, шумоподавление, цвет.
let img = sharp(input)
  .rotate()
  .resize(w, h, {
    fit: opt.fit,
    position: opt.position,
    kernel: 'lanczos3',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .modulate({ saturation: Number(opt.saturation), brightness: Number(opt.brightness) });
const c = Number(opt.contrast);
if (c !== 1) img = img.linear(c, 128 * (1 - c));
if (Number(opt.denoise) > 1) img = img.median(Number(opt.denoise));
if (Number(opt.sharpen) > 0) img = img.sharpen({ sigma: Number(opt.sharpen) });

// 3. Палитра: своя (общая для игры) или подобранная автоматически без дизеринга.
const { data: small } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const palette = opt.palette
  ? JSON.parse(readFileSync(opt.palette, 'utf-8')).map(hexToRgb)
  : kmeansPalette(small, Number(opt.colors));
let raw = mapToPalette(small, palette);

// 4. Чистка соринок.
for (let i = 0; i < Number(opt.cleanup); i++) raw = removeOrphans(raw, w, h);

// 5. Увеличение без сглаживания до итогового размера.
mkdirSync(dirname(output), { recursive: true });
await sharp(raw, { raw: { width: w, height: h, channels: 4 } })
  .resize(W, H, { kernel: 'nearest' })
  .png({ compressionLevel: 9 })
  .toFile(output);

const used = uniqueColors(raw);
if (opt['save-palette']) {
  mkdirSync(dirname(opt['save-palette']), { recursive: true });
  writeFileSync(opt['save-palette'], JSON.stringify(used.map(rgbToHex), null, 2) + '\n');
}
console.log(`✓ ${output}: ${W}×${H}, пиксель ${P}×${P} (арт ${w}×${h}), цветов: ${used.length}`);

// ---------- helpers ----------

function weightedDist(a, b) {
  return 2 * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + 3 * (a[2] - b[2]) ** 2;
}

/**
 * Палитра из k цветов методом k-means с детерминированной инициализацией
 * (k-means++ с фиксированным генератором): одна картинка — всегда один результат.
 */
function kmeansPalette(data, k, iterations = 12) {
  const px = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] >= 128) px.push([data[i], data[i + 1], data[i + 2]]);
  }
  let seed = 1337;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  const centers = [px[Math.floor(rand() * px.length)].slice()];
  const d2 = new Float64Array(px.length).fill(Infinity);
  while (centers.length < k) {
    let sum = 0;
    const last = centers.at(-1);
    for (let i = 0; i < px.length; i++) {
      d2[i] = Math.min(d2[i], weightedDist(px[i], last));
      sum += d2[i];
    }
    let r = rand() * sum;
    let pick = 0;
    for (; pick < px.length - 1 && r > d2[pick]; pick++) r -= d2[pick];
    centers.push(px[pick].slice());
  }

  const assign = new Uint16Array(px.length);
  for (let it = 0; it < iterations; it++) {
    const acc = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < px.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = weightedDist(px[i], centers[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assign[i] = best;
      const a = acc[best];
      a[0] += px[i][0];
      a[1] += px[i][1];
      a[2] += px[i][2];
      a[3]++;
    }
    acc.forEach((a, c) => {
      if (a[3]) centers[c] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
    });
  }
  return centers.map((c) => c.map((v) => Math.round(v)));
}

function mapToPalette(data, palette) {
  const out = Buffer.from(data);
  const cache = new Map();
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] < 128) {
      out[i + 3] = 0;
      continue;
    }
    const key = (out[i] << 16) | (out[i + 1] << 8) | out[i + 2];
    let best = cache.get(key);
    if (!best) {
      let dist = Infinity;
      for (const p of palette) {
        // Взвешенное расстояние: глаз чувствительнее к зелёному.
        const d = weightedDist([out[i], out[i + 1], out[i + 2]], p);
        if (d < dist) {
          dist = d;
          best = p;
        }
      }
      cache.set(key, best);
    }
    out[i] = best[0];
    out[i + 1] = best[1];
    out[i + 2] = best[2];
    out[i + 3] = 255;
  }
  return out;
}

function removeOrphans(data, width, height) {
  const out = Buffer.from(data);
  const at = (x, y) => {
    const i = (y * width + x) * 4;
    return (data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3];
  };
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const me = at(x, y);
      const counts = new Map();
      let same = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const n = at(x + dx, y + dy);
          if (n === me) same++;
          counts.set(n, (counts.get(n) ?? 0) + 1);
        }
      }
      if (same > 0) continue;
      const [major, count] = [...counts].sort((a, b) => b[1] - a[1])[0];
      if (count < 4) continue;
      const i = (y * width + x) * 4;
      out[i] = (major >>> 24) & 255;
      out[i + 1] = (major >>> 16) & 255;
      out[i + 2] = (major >>> 8) & 255;
      out[i + 3] = major & 255;
    }
  }
  return out;
}

function uniqueColors(data) {
  const set = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    set.set((data[i] << 16) | (data[i + 1] << 8) | data[i + 2], [
      data[i],
      data[i + 1],
      data[i + 2],
    ]);
  }
  return [...set.values()];
}
