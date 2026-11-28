/**
 * townWorld — дневной российский городок для площадки обкатки (по фото-референсу
 * art/source/town-reference.jpg): хрущёвки из жёлтого силикатного кирпича и серых панелей,
 * с балконами и подъездами, редкие берёзы и кусты, тротуар с низкой оградой, ровный асфальт.
 * Без мелочи: только крупные формы. Векторная отрисовка в полном разрешении экрана.
 *
 * Мир бесконечный и свой у каждого игрока (сид), рисуется кусками по мере езды:
 *   небо → дальние дома в дымке → дома улицы → тротуар, деревья → дорога.
 */
import Phaser from 'phaser';
import { getRenderZoom } from '../systems/scale.js';

const VIEW_W = 640;
const CW = 640;
const WALK = 228; // линия тротуара — низ домов и деревьев

const LAYERS = [
  { id: 'far', k: 0.12, y0: 60, y1: 232 },
  { id: 'houses', k: 0.34, y0: 0, y1: 232 },
  { id: 'street', k: 0.6, y0: 60, y1: 238 },
  { id: 'road', k: 1, y0: 226, y1: 360 },
];

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

function rect(ctx, x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

// ---------- Хрущёвка ----------

const WALLS = [
  { wall: '#c9b98f', shade: '#b3a37a', seam: '#a29270', plinth: '#8f7466' }, // жёлтый силикат
  { wall: '#d2c4a0', shade: '#bcae88', seam: '#a89a76', plinth: '#8a6f62' },
  { wall: '#b9b9b2', shade: '#a3a39c', seam: '#8e8e88', plinth: '#7d7268' }, // серая панель
  { wall: '#c4bfb1', shade: '#aeaa9c', seam: '#99958a', plinth: '#857a6e' },
];

function khrushchevka(ctx, o) {
  const { x, w, r } = o;
  const floors = 5;
  const FH = 19;
  const T = pick(r, WALLS);
  const panel = T.wall === '#b9b9b2' || T.wall === '#c4bfb1';
  const top = WALK - 8 - floors * FH;
  // Стена с лёгкой тенью к низу и торцевой тенью справа.
  const g = ctx.createLinearGradient(0, top, 0, WALK);
  g.addColorStop(0, T.wall);
  g.addColorStop(1, T.shade);
  ctx.fillStyle = g;
  ctx.fillRect(x, top, w, WALK - top);
  rect(ctx, x + w - 4, top, 4, WALK - top, 'rgba(0,0,0,0.08)');
  // Кладка или швы панелей — тонкими линиями.
  ctx.fillStyle = T.seam;
  if (panel) {
    for (let f = 0; f <= floors; f++) ctx.fillRect(x, top + 4 + f * FH, w, 0.6);
    for (let px = x + 30; px < x + w - 4; px += 30) ctx.fillRect(px, top + 4, 0.6, floors * FH);
  } else {
    ctx.globalAlpha = 0.35;
    for (let y = top + 3; y < WALK - 8; y += 3) ctx.fillRect(x, y, w, 0.4);
    ctx.globalAlpha = 1;
  }
  // Парапет и крыша, вентшахты.
  rect(ctx, x - 1.5, top - 3, w + 3, 3.5, '#7d7a74');
  rect(ctx, x - 1.5, top - 3, w + 3, 1, '#9a978f');
  for (let vx = x + 18 + r() * 20; vx < x + w - 20; vx += 60 + r() * 40) {
    rect(ctx, vx, top - 9, 8, 6, '#8a8780');
    rect(ctx, vx - 1, top - 10, 10, 1.5, '#6c6a65');
  }
  // Цоколь.
  rect(ctx, x, WALK - 8, w, 8, T.plinth);
  rect(ctx, x, WALK - 8, w, 1, 'rgba(255,255,255,0.15)');
  // Окна и балконы: шаг 17, подъезды — каждые 6 окон.
  const step = 17;
  const cols = Math.floor((w - 10) / step);
  const x0 = x + (w - cols * step) / 2 + 3;
  const stairs = new Set();
  for (let c = 3; c < cols - 1; c += 6) stairs.add(c);
  for (let f = 0; f < floors; f++) {
    const wy = top + 7 + f * FH;
    for (let c = 0; c < cols; c++) {
      const wx = x0 + c * step;
      if (stairs.has(c)) {
        // Окно лестничной клетки — между этажами, узкое.
        rect(ctx, wx + 2, wy + 6, 7, 9, '#eeece6');
        rect(ctx, wx + 3, wy + 7, 5, 7, '#7d8c99');
        continue;
      }
      // Окно: белая рама, стекло с отражением неба, импост.
      rect(ctx, wx, wy, 11, 12, '#f1efe9');
      const sky = ctx.createLinearGradient(0, wy, 0, wy + 12);
      sky.addColorStop(0, '#a9b8c4');
      sky.addColorStop(1, '#5d6b77');
      ctx.fillStyle = sky;
      ctx.fillRect(wx + 1, wy + 1, 9, 10);
      rect(ctx, wx + 5, wy + 1, 1, 10, '#f1efe9');
      if (r() < 0.25) rect(ctx, wx + 1, wy + 1, 4, 10, 'rgba(240,232,214,0.7)'); // занавеска
      rect(ctx, wx - 1, wy + 12, 13, 1.2, '#dad7cf'); // отлив
      // Балконы: через окно на этажах выше первого.
      if (f < floors - 1 && c % 3 === 1) {
        const by = wy + 13;
        const kind = r();
        rect(ctx, wx - 3, by, 17, 1.6, '#8e8b84'); // плита
        if (kind < 0.45) {
          // Застеклён белым пластиком.
          rect(ctx, wx - 3, by - 9, 17, 9, '#eeece6');
          rect(ctx, wx - 2, by - 8, 7, 4, '#8fa0ad');
          rect(ctx, wx + 6, by - 8, 7, 4, '#8fa0ad');
          rect(ctx, wx - 3, by - 3.5, 17, 3.5, '#e2dfd7');
        } else if (kind < 0.75) {
          // Открытый: металлическое ограждение.
          rect(ctx, wx - 3, by - 6, 17, 1, '#5d5f63');
          for (let k = 0; k <= 16; k += 2.5) rect(ctx, wx - 3 + k, by - 6, 0.7, 6, '#5d5f63');
        } else {
          // Обшит профлистом или вагонкой.
          rect(ctx, wx - 3, by - 8, 17, 8, pick(r, ['#9aa3a8', '#a88a64', '#c9c3b0']));
          for (let k = 0; k <= 16; k += 2)
            rect(ctx, wx - 3 + k, by - 8, 0.5, 8, 'rgba(0,0,0,0.12)');
        }
      }
    }
  }
  // Подъезды: дверь, козырёк.
  for (const c of stairs) {
    const ex = x0 + c * step;
    rect(ctx, ex + 1, WALK - 22, 9, 22, '#5a4b40');
    rect(ctx, ex + 2, WALK - 21, 7, 21, '#6e5b4c');
    rect(ctx, ex - 3, WALK - 25, 17, 3, '#8a8780');
    rect(ctx, ex - 3, WALK - 25, 17, 1, '#a6a39c');
  }
  // Водосточные трубы.
  for (const dx of [3, w - 5]) rect(ctx, x + dx, top, 1.5, WALK - top, '#8e8b84');
  // Магазин на первом этаже у части домов — одна спокойная вывеска.
  if (o.shop) {
    const sx = x0 + step * 0.2;
    const sw = Math.min(w * 0.4, 96);
    rect(ctx, sx, WALK - 30, sw, 7, pick(r, ['#2f6fb0', '#c94a3a', '#3d8a5a']));
    ctx.font = `800 5px "Onest Variable", Onest, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f4f1e8';
    ctx.fillText(
      pick(r, ['ПРОДУКТЫ', 'АПТЕКА', 'АВТОЗАПЧАСТИ', 'ХОЗТОВАРЫ']),
      sx + sw / 2,
      WALK - 26.4,
    );
    rect(ctx, sx, WALK - 22, sw, 14, '#e4dfd0');
    rect(ctx, sx + 3, WALK - 20, sw - 6, 10, '#7e8e99');
  }
}

/** Дальний дом: силуэт в дымке. */
function farBlock(ctx, o) {
  const { x, w, h, r } = o;
  const top = WALK - 4 - h;
  rect(ctx, x, top, w, h + 4, pick(r, ['#c8cbc9', '#c2c5c2', '#cdcfcb']));
  ctx.fillStyle = 'rgba(150,158,162,0.5)';
  for (let y = top + 5; y < WALK - 6; y += 7)
    for (let wx = x + 4; wx < x + w - 4; wx += 7) ctx.fillRect(wx, y, 3, 3);
}

/** Берёза: белый ствол, лёгкая крона из нескольких мягких масс. */
function birch(ctx, o) {
  const { x, h, r } = o;
  const base = WALK + 2;
  rect(ctx, x - 1.2, base - h * 0.75, 2.4, h * 0.75, '#ecebe6');
  for (let i = 0; i < 8; i++) rect(ctx, x - 1.2, base - h * (0.1 + r() * 0.6), 2.4, 0.8, '#2b2826');
  const cols = ['#5f7a45', '#728d52', '#87a062', '#9ab06e'];
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = cols[i % cols.length];
    ctx.beginPath();
    ctx.ellipse(
      x + (r() - 0.5) * h * 0.35,
      base - h * (0.55 + r() * 0.4),
      h * (0.12 + r() * 0.08),
      h * (0.14 + r() * 0.08),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

/** Куст у дома: тёмно-зелёная округлая масса. */
function bush(ctx, o) {
  const { x, h, r } = o;
  const base = WALK + 1;
  const cols = ['#3f5a36', '#4c6a40', '#5d7a4c'];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = cols[i % 3];
    ctx.beginPath();
    ctx.ellipse(
      x + (r() - 0.5) * h * 1.2,
      base - h * (0.35 + r() * 0.25),
      h * 0.5,
      h * 0.4,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

/** Фонарный столб — бетонный, с плафоном. */
function lamp(ctx, o) {
  const { x } = o;
  const base = WALK + 3;
  rect(ctx, x - 1.2, base - 90, 2.4, 90, '#a5a39d');
  rect(ctx, x, base - 90, 10, 1.6, '#8e8c86');
  rect(ctx, x + 8, base - 90, 5, 2.4, '#6e6c67');
}

const DRAW = { khrushchevka, far: farBlock, birch, bush, lamp };

function chunkObjects(seed, spec, ci) {
  const x0 = ci * CW;
  const r = rand(hash(seed, ci, spec.id.charCodeAt(0) * 37 + spec.id.length) * 2 ** 32);
  const list = [];
  const add = (o) => list.push({ seed: Math.floor(r() * 2 ** 31), ...o });
  if (spec.id === 'far') {
    for (let x = x0; x < x0 + CW;) {
      const w = 60 + r() * 90;
      if (r() < 0.75) add({ kind: 'far', x, w, h: 50 + r() * 40, span: w });
      x += w + 10 + r() * 40;
    }
  } else if (spec.id === 'houses') {
    // Дома с проездами во дворы между ними — как на фото.
    for (let x = x0; x < x0 + CW;) {
      const w = 230 + r() * 140;
      add({ kind: 'khrushchevka', x, w, shop: r() < 0.35, span: w });
      x += w + 40 + r() * 70;
    }
  } else if (spec.id === 'street') {
    for (let x = x0; x < x0 + CW; x += 70 + r() * 120) {
      const v = r();
      if (v < 0.35) add({ kind: 'birch', x, h: 70 + r() * 40, span: 40 });
      else if (v < 0.75) add({ kind: 'bush', x, h: 12 + r() * 10, span: 20 });
    }
    for (let n = Math.floor(x0 / 220); n * 220 < x0 + CW; n++) {
      const lx = n * 220 + 30;
      if (lx >= x0 && lx < x0 + CW) add({ kind: 'lamp', x: lx, span: 20 });
    }
  }
  return list;
}

/** Тротуар, бордюр и дорога: ровный серый асфальт с редкими заплатами, разметка. */
function drawRoad(ctx, seed, x0, ppm) {
  const x1 = x0 + CW;
  // Газон и тротуар.
  rect(ctx, x0, 226, CW, 4, '#7c8a5a');
  rect(ctx, x0, 230, CW, 5, '#a9a7a1');
  for (let x = Math.floor(x0 / 24) * 24; x < x1; x += 24)
    rect(ctx, x, 230, 0.5, 5, 'rgba(0,0,0,0.15)');
  // Бордюр: белые и чёрные блоки, как на фото.
  for (let x = Math.floor(x0 / 16) * 16; x < x1; x += 16)
    rect(ctx, x, 235, 16, 2, (x / 16) % 2 ? '#3a3b3d' : '#e8e7e2');
  // Асфальт.
  const g = ctx.createLinearGradient(0, 237, 0, 360);
  g.addColorStop(0, '#76787a');
  g.addColorStop(1, '#6a6c6e');
  ctx.fillStyle = g;
  ctx.fillRect(x0, 237, CW, 123);
  for (let y = 238; y < 360; y += 2)
    for (let x = Math.floor(x0 / 2) * 2; x < x1; x += 2) {
      const v = hash(seed, x, y, 9);
      if (v < 0.05) rect(ctx, x, y, 2, 1, v < 0.025 ? '#7e8082' : '#646668');
    }
  // Заплаты.
  for (let m = Math.floor(x0 / ppm / 20) * 20; m * ppm < x1 + 80; m += 20) {
    if (hash(seed, m, 61) > 0.4) continue;
    const px = m * ppm + hash(seed, m, 62) * 200;
    const py = 250 + hash(seed, m, 63) * 90;
    rect(ctx, px, py, 30 + hash(seed, m, 64) * 60, 6 + hash(seed, m, 65) * 6, '#636567');
  }
  // Разметка: прерывистая осевая, сплошная у ближнего края.
  const period = 12 * ppm;
  for (let s = Math.floor(x0 / period) * period; s < x1; s += period)
    rect(ctx, s, 300, 3 * ppm, 2, '#e9e8e2');
  rect(ctx, x0, 352, CW, 1.6, '#dcdbd5');
}

function drawSky(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#cfd4d8');
  g.addColorStop(1, '#e6e7e6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export class TownWorld {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ seed: number, ppm: number }} opts
   */
  constructor(scene, { seed, ppm }) {
    this.scene = scene;
    this.seed = seed >>> 0;
    this.ppm = ppm;
    this.res = Phaser.Math.Clamp(Math.round(getRenderZoom() * 2) / 2, 1, 2);
    this.id = `tw${Math.floor(Math.random() * 1e9)}`;
    const c = document.createElement('canvas');
    c.width = VIEW_W * this.res;
    c.height = 240 * this.res;
    const ctx = c.getContext('2d');
    ctx.scale(this.res, this.res);
    drawSky(ctx, VIEW_W, 240);
    scene.textures.addCanvas(`${this.id}_sky`, c).setFilter(Phaser.Textures.FilterMode.LINEAR);
    scene.add
      .image(0, 0, `${this.id}_sky`)
      .setOrigin(0)
      .setScale(1 / this.res);
    this.layers = LAYERS.map((spec) => ({
      spec,
      box: scene.add.container(0, 0),
      chunks: new Map(),
    }));
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    this.update(0, true);
  }

  #render(layer, ci) {
    const { spec } = layer;
    const res = this.res;
    const c = document.createElement('canvas');
    c.width = CW * res;
    c.height = (spec.y1 - spec.y0) * res;
    const ctx = c.getContext('2d');
    const x0 = ci * CW;
    ctx.setTransform(res, 0, 0, res, -x0 * res, -spec.y0 * res);
    if (spec.id === 'road') drawRoad(ctx, this.seed, x0, this.ppm);
    const objs = [ci - 1, ci, ci + 1]
      .flatMap((i) => chunkObjects(this.seed, spec, i))
      .filter((o) => o.x + (o.span ?? 100) > x0 - 20 && o.x - 40 < x0 + CW);
    for (const o of objs) DRAW[o.kind]?.(ctx, { ...o, r: rand(o.seed) });
    if (spec.id === 'far') {
      const g = ctx.createLinearGradient(0, 120, 0, 232);
      g.addColorStop(0, 'rgba(225,228,228,0)');
      g.addColorStop(1, 'rgba(225,228,228,0.5)');
      ctx.fillStyle = g;
      ctx.fillRect(x0, 120, CW, 112);
    }
    const key = `${this.id}_${spec.id}_${ci}`;
    this.scene.textures.addCanvas(key, c).setFilter(Phaser.Textures.FilterMode.LINEAR);
    const img = this.scene.add
      .image(ci * CW, spec.y0, key)
      .setOrigin(0)
      .setScale(1 / res);
    layer.box.add(img);
    layer.chunks.set(ci, img);
  }

  /** Кадр: сдвиг слоёв по пути (точки мира), подгрузка и уборка кусков — по куску за кадр. */
  update(scroll, now = false) {
    let budget = now ? Infinity : 1;
    for (const layer of this.layers) {
      const s = scroll * layer.spec.k;
      layer.box.x = -s;
      const first = Math.floor(s / CW);
      const last = Math.floor((s + VIEW_W) / CW);
      for (let ci = first; ci <= last + 1; ci++) {
        if (layer.chunks.has(ci)) continue;
        if (ci <= last || budget > 0) {
          this.#render(layer, ci);
          if (ci > last) budget -= 1;
        }
      }
      for (const [ci, img] of layer.chunks) {
        if (ci >= first - 1 && ci <= last + 1) continue;
        const key = img.texture.key;
        img.destroy();
        this.scene.textures.remove(key);
        layer.chunks.delete(ci);
      }
    }
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
