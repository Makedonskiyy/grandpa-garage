/**
 * cityWorld — ночной проспект для заезда с Палычем, по фото-референсу
 * (art/source/race-reference.jpg): сталинки с карнизами и башенками, хрущёвки из панелей
 * и белого кирпича с балконами, на первых этажах — светящиеся вывески («Аптека», «Кафе»,
 * «Компьютерный клуб», «Обмен валют»…), на крышах — рекламные щиты, вдоль тротуара —
 * фонари с натриевым светом, осенние деревья, остановки, вход в метро, ларьки, ограда,
 * над дорогой — троллейбусные провода. Асфальт мокрый: в нём отражаются фонари и вывески.
 *
 * Как и лес объездной, город рисуется кусками на canvas по сиду игрока и бесконечен:
 * дома, вывески и фонари у каждого стоят по-своему. Слои параллакса (k — доля скорости дороги):
 *   небо → дальние дома в дымке → дома проспекта → тротуар (фонари, деревья, остановки) →
 *   провода → дорога.
 */
import Phaser from 'phaser';
import { getRenderZoom } from '../systems/scale.js';

const VIEW_W = 640;
const CW = 640;
const SIDEWALK = 154; // линия тротуара (низ домов), экранная y
const ROAD_TOP = 158;

const LAYERS = [
  { id: 'far', k: 0.12, y0: 0, y1: 160 },
  { id: 'houses', k: 0.32, y0: 0, y1: 160 },
  { id: 'street', k: 0.62, y0: 0, y1: 164 },
  { id: 'wires', k: 0.75, y0: 0, y1: 60 },
  { id: 'road', k: 1, y0: 150, y1: 360 },
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
const FONT = '"Onest Variable", Onest, system-ui, sans-serif';

function vgrad(ctx, x, y, w, h, top, bottom) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/** Неоновая надпись: светящийся ореол и яркая сердцевина. */
/** Мягкое пятно света (натриевый фонарь, окно, вывеска). */
function glow(ctx, x, y, rx, ry, color, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, `rgba(${color},${a})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------- Окна ----------

/** Окно ночью: тёмное, тёплое (люстра), голубое (телевизор); с рамой и занавесками. */
function windowPane(ctx, r, x, y, w, h, frame) {
  const v = r();
  let fill = '#151a22';
  if (v < 0.22) fill = pick(r, ['#ffcf7a', '#ffc35c', '#ffd99a', '#f4b45a']);
  else if (v < 0.27) fill = pick(r, ['#a8c8ff', '#9fd0e8']);
  ctx.fillStyle = frame;
  ctx.fillRect(x - 0.6, y - 0.6, w + 1.2, h + 1.2);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (v < 0.27) {
    // Занавески по краям и перекрестье рамы.
    ctx.fillStyle = 'rgba(120,60,30,0.35)';
    ctx.fillRect(x, y, w * 0.22, h);
    ctx.fillRect(x + w * 0.78, y, w * 0.22, h);
    glow(
      ctx,
      x + w / 2,
      y + h / 2,
      w * 1.4,
      h * 1.1,
      v < 0.22 ? '255,200,120' : '150,190,255',
      0.18,
    );
  } else {
    // Отблеск неба в тёмном стекле.
    ctx.fillStyle = 'rgba(120,140,170,0.12)';
    ctx.fillRect(x, y, w, h * 0.35);
  }
  ctx.fillStyle = frame;
  ctx.fillRect(x + w / 2 - 0.3, y, 0.6, h);
  ctx.fillRect(x, y + h * 0.35, w, 0.5);
}

// ---------- Дома ----------

const SIGNS = [
  ['АПТЕКА', '#4cff8a'],
  ['КАФЕ', '#ff3b3b'],
  ['ПРОДУКТЫ 24', '#ff5a3a'],
  ['КОМПЬЮТЕРНЫЙ КЛУБ', '#ffd84a'],
  ['ОБМЕН ВАЛЮТ', '#ffb84a'],
  ['ПЕЧАТИ', '#ff4a4a'],
  ['ЦВЕТЫ', '#ff6ad5'],
  ['ШАУРМА', '#ffa13a'],
  ['СОТОВЫЕ', '#5ac8ff'],
  ['РЕМОНТ ОБУВИ', '#ffd84a'],
  ['БИЛЬЯРД', '#7cff6a'],
  ['ВИДЕОПРОКАТ', '#ff5ae0'],
];
const ROOF_ADS = [
  ['ГОРСВЯЗЬ', 'всегда на связи', '#c62828', '#ffffff'],
  ['ПИВО ЯНТАРНОЕ', 'с 1978 года', '#1d3f7a', '#f2d36a'],
  ['ТЕЛЕВИЗОРЫ', 'в кредит', '#f2f0ea', '#c62828'],
  ['РАДИО 105,7', 'ночной эфир', '#2a2a2a', '#ffd84a'],
];

/**
 * Первый этаж с магазинами: витрины с товаром и короб-вывеска над каждой. Вывеска —
 * световой короб в тёмной рамке, надпись подогнана по ширине и светится ровно,
 * без размазанного ореола.
 */
function shopFloor(ctx, r, x, w, base, h, wall) {
  const px = (X, Y, W, H, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(
      Math.round(X),
      Math.round(Y),
      Math.max(1, Math.round(W)),
      Math.max(1, Math.round(H)),
    );
  };
  x = Math.round(x);
  w = Math.round(w);
  px(x, base - h, w, h, wall);
  const n = Math.max(1, Math.floor(w / 46));
  const sw = Math.floor(w / n);
  for (let i = 0; i < n; i++) {
    const sx = x + i * sw;
    const lit = r() < 0.7;
    // Витрина: рама, стекло, полки с товаром, дверь сбоку.
    px(sx + 3, base - h + 9, sw - 6, h - 9, '#2a2c30');
    px(sx + 4, base - h + 10, sw - 14, h - 11, lit ? '#e9c48a' : '#1a1f27');
    if (lit) {
      for (let k = 0; k < 2; k++) px(sx + 4, base - h + 13 + k * 3, sw - 14, 1, '#b98a52');
      for (let k = 0; k < (sw - 16) / 2; k++)
        px(
          sx + 5 + k * 2,
          base - h + 11 + (k % 2) * 3,
          1,
          2,
          pick(r, ['#c94a3a', '#2f6fb0', '#e0a13a', '#3d8a5a', '#f2efe6']),
        );
      glow(ctx, sx + sw / 2, base - 2, sw * 0.6, 4, '255,210,150', 0.35);
    }
    px(sx + sw - 9, base - h + 10, 5, h - 10, '#3a2e26'); // дверь
    px(sx + sw - 8, base - h + 11, 3, 4, lit ? '#e9c48a' : '#263040');
    // Короб-вывеска.
    if (r() < 0.8) {
      const [text, color] = pick(r, SIGNS);
      const bx = sx + 3;
      const bw = sw - 6;
      px(bx, base - h + 1, bw, 7, '#0f1012');
      px(bx + 1, base - h + 2, bw - 2, 5, '#191b1f');
      const size = fitFont(ctx, text, bw - 6, 5.6, 800);
      ctx.save();
      ctx.font = `800 ${size}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = color;
      ctx.shadowBlur = 3;
      ctx.fillStyle = color;
      ctx.fillText(text, bx + bw / 2, base - h + 4.6);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, bx + bw / 2, base - h + 4.6);
      ctx.restore();
      glow(ctx, bx + bw / 2, base - h + 5, bw * 0.6, 6, hexToRgb(color), 0.14);
    }
  }
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/** Сталинка: 7 этажей, лепной карниз с балюстрадой, пилястры, высокие окна, иногда башенка. */
function stalinka(ctx, o) {
  const { x, w, r } = o;
  const base = SIDEWALK;
  const floors = 7;
  const fh = 13;
  const H = floors * fh + 18;
  const top = base - H;
  const wall = pick(r, ['#9c9282', '#a89c86', '#8f8778', '#b1a58f']);
  vgrad(ctx, x, top, w, H, wall, '#5d574e');
  // Грязные потёки и тёмный цоколь.
  for (let i = 0; i < w / 6; i++) {
    ctx.fillStyle = `rgba(40,36,30,${0.05 + r() * 0.08})`;
    ctx.fillRect(x + r() * w, top + r() * H * 0.6, 0.8 + r() * 2, 8 + r() * 30);
  }
  // Башенка со шпилем на углу.
  if (o.tower) {
    const tx = x + (o.towerLeft ? 8 : w - 38);
    vgrad(ctx, tx, top - 26, 30, 26, wall, '#6d665b');
    ctx.fillStyle = '#4a463f';
    ctx.fillRect(tx - 2, top - 28, 34, 3);
    ctx.fillStyle = '#3f3c37';
    ctx.beginPath();
    ctx.moveTo(tx + 6, top - 28);
    ctx.lineTo(tx + 15, top - 44);
    ctx.lineTo(tx + 24, top - 28);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6d665b';
    ctx.fillRect(tx + 14.4, top - 56, 1.2, 12);
    for (let k = 0; k < 3; k++) windowPane(ctx, r, tx + 4 + k * 8.4, top - 20, 5, 9, '#4a453d');
  }
  // Карниз с балюстрадой.
  ctx.fillStyle = '#6f685c';
  ctx.fillRect(x - 3, top - 2, w + 6, 4);
  ctx.fillStyle = '#c4b9a3';
  ctx.fillRect(x - 3, top - 3, w + 6, 1);
  for (let bx = x; bx < x + w; bx += 3) {
    ctx.fillStyle = '#8a8274';
    ctx.fillRect(bx, top - 9, 1.4, 6);
  }
  ctx.fillStyle = '#7a7366';
  ctx.fillRect(x - 2, top - 10, w + 4, 1.4);
  // Пилястры и окна по этажам.
  const cols = Math.max(4, Math.floor(w / 13));
  const cw = w / cols;
  for (let cI = 0; cI < cols; cI++) {
    if (cI % 3 === 0) {
      ctx.fillStyle = 'rgba(255,245,225,0.08)';
      ctx.fillRect(x + cI * cw, top + 4, 1.6, H - 26);
    }
  }
  for (let f = 0; f < floors - 1; f++) {
    const fy = top + 6 + f * fh;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(x, fy + fh - 1.5, w, 0.6);
    for (let cI = 0; cI < cols; cI++) {
      const wx = x + cI * cw + cw * 0.22;
      const ww = cw * 0.56;
      // Сандрик над окном, иногда — балкон с балясинами.
      ctx.fillStyle = '#7b7468';
      ctx.fillRect(wx - 1, fy + 1, ww + 2, 1);
      windowPane(ctx, r, wx, fy + 2.4, ww, fh - 5.4, '#4a453d');
      if (f === 2 && cI % 4 === 1) {
        ctx.fillStyle = '#6f685c';
        ctx.fillRect(wx - 2, fy + fh - 3, ww + 4, 1.4);
        for (let bx = wx - 1.5; bx < wx + ww + 2; bx += 1.6) ctx.fillRect(bx, fy + fh - 6, 0.6, 3);
      }
    }
  }
  // Кондиционеры и тарелки.
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = '#c9c6bf';
    ctx.fillRect(x + r() * (w - 6), top + 14 + r() * (H - 40), 4, 3);
  }
  shopFloor(ctx, r, x, w, base, 16, wall);
}

/**
 * Хрущёвка (1-464 / 1-447): 5 этажей, силикатный кирпич или панели со швами, плоская крыша
 * с парапетом, вентшахтами и антеннами, окна в белых рамах (часть горит), балконы —
 * открытые с бельём, застеклённые белым пластиком и деревом, подъезды с козырьками
 * и лампочками, водостоки, тарелки. Рисуется по целым точкам мира — чёткие пиксели.
 */
function khrushchevka(ctx, o) {
  const r = o.r;
  const x = Math.round(o.x);
  const w = Math.round(o.w);
  const base = SIDEWALK;
  const px = (X, Y, W, H, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(
      Math.round(X),
      Math.round(Y),
      Math.max(1, Math.round(W)),
      Math.max(1, Math.round(H)),
    );
  };
  const brick = r() < 0.55;
  const FH = 12; // этаж
  const floors = 5;
  const plinth = 4;
  const top = base - plinth - floors * FH - 2;
  // Тона стены: силикатный кирпич (светлый серо-жёлтый) или серая панель.
  const T = brick
    ? { wall: '#a8a397', light: '#b8b3a6', dark: '#928d81', seam: '#857f73' }
    : { wall: '#8d9195', light: '#9ca0a4', dark: '#7c8084', seam: '#5f6367' };
  px(x, top, w, base - top, T.wall);
  if (brick) {
    // Кладка: ряды в перевязку, кое-где кирпичи светлее и темнее.
    for (let y = top + 2; y < base - plinth; y += 2) {
      px(x, y, w, 1, T.dark);
      const off = (y / 2) % 2 ? 0 : 3;
      for (let bx = x + off; bx < x + w; bx += 6) {
        px(bx, y - 1, 1, 1, T.seam);
        if (r() < 0.06) px(bx + 1, y - 1, 4, 1, r() < 0.5 ? T.light : T.dark);
      }
    }
  } else {
    // Панели: горизонтальные швы по этажам и вертикальные через 3 окна, швы промазаны темнее.
    for (let f = 0; f <= floors; f++) px(x, top + 2 + f * FH, w, 1, T.seam);
    for (let sx = x + 18; sx < x + w - 2; sx += 18) px(sx, top + 2, 1, floors * FH, T.seam);
    for (let i = 0; i < w / 8; i++)
      px(x + r() * w, top + 3 + r() * floors * FH, 1 + r() * 3, 1, T.dark);
  }
  // Потёки под парапетом и ржавые полосы от водостоков.
  for (let i = 0; i < w / 14; i++) {
    ctx.globalAlpha = 0.18;
    px(x + r() * w, top + 2, 1, 6 + r() * 20, '#5a5248');
    ctx.globalAlpha = 1;
  }
  // Цоколь и отмостка.
  px(x, base - plinth, w, plinth, '#6d6a64');
  px(x, base - plinth, w, 1, '#86837c');
  // Крыша: парапет, вентшахты, антенны.
  px(x - 1, top - 1, w + 2, 2, '#55575a');
  px(x - 1, top - 1, w + 2, 1, '#6d6f72');
  for (let vx = x + 10 + r() * 10; vx < x + w - 10; vx += 36 + r() * 20) {
    px(vx, top - 6, 6, 5, '#6a6c6f');
    px(vx, top - 6, 6, 1, '#808285');
    px(vx - 1, top - 7, 8, 1, '#4c4e51');
  }
  ctx.fillStyle = '#2a2c30';
  for (let i = 0; i < 2 + w / 45; i++) {
    const ax = Math.round(x + 4 + r() * (w - 8));
    const ah = 8 + Math.round(r() * 6);
    px(ax, top - 1 - ah, 1, ah, '#2e3034');
    px(ax - 3, top - ah + 1, 7, 1, '#2e3034');
    px(ax - 2, top - ah + 3, 5, 1, '#2e3034');
  }
  // Окна и балконы. Шаг окон 11 точек, подъезд — каждые 4 окна.
  const step = 11;
  const cols = Math.floor((w - 6) / step);
  const x0 = x + Math.round((w - cols * step) / 2) + 2;
  const entrances = new Set();
  for (let c = 2; c < cols - 1; c += 5) entrances.add(c);
  const balconyCol = (c) => c % 5 === 4 || c % 5 === 1;
  for (let f = 0; f < floors; f++) {
    const wy = top + 4 + f * FH;
    for (let c = 0; c < cols; c++) {
      const wx = x0 + c * step;
      // Лестничная клетка над подъездом: узкое окно посередине пролёта.
      if (entrances.has(c)) {
        px(wx + 1, wy + 2, 4, 6, '#e8e6df');
        px(wx + 2, wy + 3, 2, 4, r() < 0.4 ? '#d9c27a' : '#232a34');
        continue;
      }
      const lit = r() < 0.24;
      const glass = lit
        ? pick(r, ['#f0c46a', '#e8b45a', '#f6d48a', '#a9c6ea'])
        : pick(r, ['#1c232d', '#202833', '#18202a']);
      // Рама: белый пластик или старое дерево.
      const frame = r() < 0.7 ? '#e9e7e0' : '#b9a88a';
      px(wx, wy, 7, 8, frame);
      px(wx + 1, wy + 1, 5, 6, glass);
      px(wx + 3, wy + 1, 1, 6, frame); // импост
      if (lit) {
        px(wx + 1, wy + 1, 1, 6, 'rgba(120,60,30,0.45)'); // занавеска
        px(wx + 5, wy + 1, 1, 6, 'rgba(120,60,30,0.45)');
      } else px(wx + 1, wy + 1, 2, 1, 'rgba(140,160,190,0.35)'); // отблеск
      px(wx - 1, wy + 8, 9, 1, '#c9c6bd'); // отлив
      // Балкон на этажах выше первого.
      if (f < floors - 1 && balconyCol(c)) {
        const by = wy + 9;
        const kind = r();
        px(wx - 2, by, 11, 1, '#6d6f72'); // плита
        if (kind < 0.4) {
          // Открытый: решётка, иногда бельё и цветы.
          px(wx - 2, by - 4, 11, 1, '#3e4044');
          for (let k = 0; k < 11; k += 2) px(wx - 2 + k, by - 4, 1, 4, '#3e4044');
          if (r() < 0.5) {
            px(wx, by - 7, 2, 3, pick(r, ['#c94a3a', '#3f6fa0', '#e8e2d2', '#e0a13a']));
            px(wx + 3, by - 7, 2, 2, pick(r, ['#e8e2d2', '#7a9a5a']));
          }
        } else if (kind < 0.8) {
          // Застеклённый белым пластиком.
          px(wx - 2, by - 8, 11, 8, '#e4e2db');
          px(wx - 1, by - 7, 4, 3, lit ? '#f0c46a' : '#26303c');
          px(wx + 4, by - 7, 4, 3, '#26303c');
          px(wx - 2, by - 3, 11, 3, '#cfccc3');
        } else {
          // Обшит вагонкой: коричневое дерево.
          px(wx - 2, by - 8, 11, 8, '#7a5a3a');
          for (let k = 0; k < 11; k += 2) px(wx - 2 + k, by - 8, 1, 8, '#6a4c30');
          px(wx, by - 7, 6, 2, '#2a3038');
        }
      }
    }
  }
  // Подъезды: дверь, козырёк, лампочка, табличка, скамейка.
  for (const c of entrances) {
    const ex = x0 + c * step;
    px(ex, base - plinth - 10, 7, 10 + plinth, '#3a2e26');
    px(ex + 1, base - plinth - 9, 5, 9 + plinth, '#4e3a2c');
    px(ex + 3, base - plinth - 5, 1, 1, '#c9c6bd');
    px(ex - 3, base - plinth - 12, 13, 2, '#6d6f72'); // козырёк
    px(ex - 3, base - plinth - 12, 13, 1, '#86888b');
    px(ex + 3, base - plinth - 10, 1, 1, '#ffe2a0'); // лампочка
    glow(ctx, ex + 3.5, base - plinth - 9, 9, 7, '255,210,140', 0.55);
    px(ex + 8, base - plinth - 9, 2, 2, '#2f6fb0'); // номер подъезда
    px(ex - 8, base - 3, 6, 1, '#6b4e36'); // скамейка
    px(ex - 8, base - 2, 1, 2, '#3a3c40');
    px(ex - 3, base - 2, 1, 2, '#3a3c40');
  }
  // Водостоки по краям.
  for (const dx of [2, w - 3]) {
    px(x + dx, top, 1, base - top - 1, '#6a6c6f');
    px(x + dx - 1, base - 3, 3, 1, '#6a6c6f');
  }
  // Спутниковые тарелки и кондиционеры.
  for (let i = 0; i < 2 + w / 70; i++) {
    const sx = Math.round(x + 6 + r() * (w - 12));
    const sy = Math.round(top + 6 + r() * (floors - 1) * FH);
    if (r() < 0.6) {
      px(sx, sy, 3, 3, '#d9d6cf');
      px(sx + 1, sy + 1, 1, 1, '#a9a69f');
    } else {
      px(sx, sy, 4, 3, '#cfcdc6');
      px(sx + 1, sy + 1, 2, 1, '#8a8882');
    }
  }
  // Магазин в торце — у некоторых домов первый этаж под вывеску.
  if (o.shop) shopFloor(ctx, r, x, Math.min(w, 70), base, 14, T.dark);
  // Рекламный щит на крыше.
  if (o.ad) roofAd(ctx, o.ad, x, w, top);
}

/** Рекламный щит на крыше: фермы, подсветка снизу. */
function roofAd(ctx, ad, x, w, top) {
  const [title, sub, bg, fg] = ad;
  const bw = Math.min(w - 10, 90);
  const bx = Math.round(x + (w - bw) / 2);
  ctx.fillStyle = '#2a2c30';
  ctx.fillRect(bx + 8, top - 10, 1, 10);
  ctx.fillRect(bx + bw - 9, top - 10, 1, 10);
  ctx.fillRect(bx - 1, top - 33, bw + 2, 24);
  ctx.fillStyle = bg;
  ctx.fillRect(bx, top - 32, bw, 22);
  glow(ctx, bx + bw / 2, top - 21, bw * 0.7, 16, '255,240,210', 0.18);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fg;
  ctx.font = `800 ${fitFont(ctx, title, bw - 8, 9, 800)}px ${FONT}`;
  ctx.fillText(title, bx + bw / 2, top - 24);
  ctx.font = `500 5px ${FONT}`;
  ctx.fillText(sub, bx + bw / 2, top - 15);
  for (const lx of [bx + 10, bx + bw - 12]) glow(ctx, lx, top - 12, 8, 4, '255,240,200', 0.4);
}

/** Самый крупный кегль (не больше max), при котором надпись влезает в ширину. */
function fitFont(ctx, text, width, max, weight = 700) {
  ctx.font = `${weight} 10px ${FONT}`;
  const w10 = ctx.measureText(text).width;
  return Math.max(3, Math.min(max, (10 * width) / w10));
}

/** Дальние дома: силуэты в дымке с редкими огнями. */
function farBlock(ctx, o) {
  const { x, w, h, r } = o;
  const top = SIDEWALK - 6 - h;
  vgrad(ctx, x, top, w, h + 6, '#2a303a', '#1d222b');
  for (let y = top + 4; y < SIDEWALK - 8; y += 5)
    for (let wx = x + 3; wx < x + w - 3; wx += 4) {
      if (r() < 0.16) {
        ctx.fillStyle = r() < 0.85 ? 'rgba(255,200,120,0.6)' : 'rgba(150,190,255,0.5)';
        ctx.fillRect(wx, y, 1.6, 2);
      }
    }
  if (r() < 0.35) {
    ctx.fillStyle = '#c62828';
    ctx.fillRect(x + w / 2, top - 6, 1, 6);
    glow(ctx, x + w / 2 + 0.5, top - 6, 3, 3, '255,60,40', 0.8);
  }
}

// ---------- Тротуар ----------

function streetLight(ctx, o) {
  const { x } = o;
  const base = SIDEWALK + 2;
  vgrad(ctx, x - 1, base - 92, 2, 92, '#4a4d52', '#2a2c30');
  ctx.fillStyle = '#2a2c30';
  ctx.fillRect(x - 2, base - 6, 4, 6);
  // Двойной кронштейн с двумя плафонами.
  ctx.strokeStyle = '#3a3c40';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, base - 86);
  ctx.quadraticCurveTo(x + 4, base - 94, x + 12, base - 92);
  ctx.moveTo(x, base - 78);
  ctx.quadraticCurveTo(x + 3, base - 84, x + 9, base - 83);
  ctx.stroke();
  for (const [lx, ly] of [
    [x + 13, base - 92],
    [x + 10, base - 83],
  ]) {
    glow(ctx, lx, ly + 1, 26, 22, '255,170,70', 0.35);
    ctx.fillStyle = '#ffd38a';
    ctx.beginPath();
    ctx.ellipse(lx, ly + 1, 3, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff3d6';
    ctx.fillRect(lx - 1, ly + 1, 2, 1);
  }
  // Светлое пятно на тротуаре.
  glow(ctx, x + 10, base, 40, 6, '255,170,70', 0.35);
}

function autumnTree(ctx, o) {
  const { x, h, r } = o;
  const base = SIDEWALK + 2;
  ctx.strokeStyle = '#2a221c';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.lineTo(x + (r() - 0.5) * 4, base - h * 0.6);
  ctx.stroke();
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 7; i++) {
    const y = base - h * (0.35 + r() * 0.4);
    const s = r() < 0.5 ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + s * h * (0.15 + r() * 0.15), y - h * (0.1 + r() * 0.15));
    ctx.stroke();
  }
  const cols = ['#6b4a22', '#8a5e26', '#a0702c', '#5a4a2a', '#4a3a22'];
  for (let i = 0; i < 90; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r());
    ctx.fillStyle = cols[Math.floor(r() * cols.length)];
    ctx.globalAlpha = 0.85;
    const s = 0.8 + r() * 1.4;
    ctx.fillRect(
      x + Math.cos(a) * d * h * 0.32,
      base - h * 0.68 + Math.sin(a) * d * h * 0.3,
      s,
      s * 0.8,
    );
  }
  ctx.globalAlpha = 1;
}

function busShelter(ctx, o) {
  const { x, r } = o;
  const base = SIDEWALK + 2;
  const w = 58;
  ctx.fillStyle = '#3a3c40';
  ctx.fillRect(x, base - 30, w, 3);
  ctx.fillRect(x + 2, base - 28, 1.4, 28);
  ctx.fillRect(x + w - 3, base - 28, 1.4, 28);
  ctx.fillStyle = 'rgba(160,180,190,0.25)';
  ctx.fillRect(x + 3, base - 27, w - 6, 20);
  // Объявления на стекле, подсвеченная реклама сбоку.
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = pick(r, ['#e8e2d2', '#f2e9a8', '#d9e4ef', '#f0d0c0']);
    ctx.fillRect(x + 5 + r() * (w - 14), base - 25 + r() * 14, 3 + r() * 2, 3 + r() * 2);
  }
  vgrad(ctx, x + w - 14, base - 26, 10, 18, '#f4f0e6', '#d9d2c0');
  glow(ctx, x + w - 9, base - 17, 12, 12, '255,245,220', 0.3);
  ctx.fillStyle = '#6b4e36';
  ctx.fillRect(x + 8, base - 10, w - 26, 1.6);
}

function fence(ctx, x0, x1) {
  const base = SIDEWALK + 2;
  ctx.fillStyle = '#2a2c30';
  ctx.fillRect(x0, base - 10, x1 - x0, 0.8);
  ctx.fillRect(x0, base - 2, x1 - x0, 0.8);
  for (let x = Math.ceil(x0 / 2.2) * 2.2; x < x1; x += 2.2) ctx.fillRect(x, base - 10, 0.5, 9);
  for (let x = Math.ceil(x0 / 44) * 44; x < x1; x += 44) ctx.fillRect(x - 0.5, base - 11, 1.4, 11);
}

const DRAW = {
  stalinka,
  khrushchevka,
  far: farBlock,
  light: streetLight,
  tree: autumnTree,
  shelter: busShelter,
};

// ---------- Генерация ----------

function chunkObjects(seed, spec, ci) {
  const x0 = ci * CW;
  const r = rand(hash(seed, ci, spec.id.charCodeAt(0) * 31 + spec.id.length) * 2 ** 32);
  const list = [];
  const add = (o) => list.push({ seed: Math.floor(r() * 2 ** 31), ...o });
  if (spec.id === 'far') {
    for (let x = x0; x < x0 + CW;) {
      const w = 30 + r() * 60;
      add({ kind: 'far', x, w, h: 50 + r() * 70, span: w });
      x += w + r() * 10;
    }
  } else if (spec.id === 'houses') {
    // Квартал: дома вплотную, изредка — проезд во двор.
    for (let x = x0; x < x0 + CW;) {
      const stal = r() < 0.45;
      const w = stal ? 110 + r() * 90 : 120 + r() * 110;
      if (stal)
        add({ kind: 'stalinka', x, w, tower: r() < 0.4, towerLeft: r() < 0.5, span: w + 10 });
      else
        add({
          kind: 'khrushchevka',
          x,
          w,
          ad: r() < 0.12 ? pick(r, ROOF_ADS) : null,
          shop: r() < 0.4,
          span: w + 10,
        });
      x += w + (r() < 0.25 ? 14 + r() * 20 : 0);
    }
  } else if (spec.id === 'street') {
    // Фонари — ровным шагом, между ними — деревья и редкие остановки.
    const step = 150;
    for (let n = Math.floor(x0 / step); n * step < x0 + CW; n++) {
      const lx = n * step + 20;
      if (lx >= x0 && lx < x0 + CW) add({ kind: 'light', x: lx, span: 50 });
      const rs = rand(hash(seed, n, 919) * 2 ** 32);
      const mid = n * step + 60;
      if (mid < x0 || mid >= x0 + CW) continue;
      const v = rs();
      if (v < 0.18) add({ kind: 'shelter', x: mid, span: 70 });
      for (let k = 0; k < 2; k++)
        if (rs() < 0.65)
          add({ kind: 'tree', x: n * step + 45 + k * 70 + rs() * 20, h: 50 + rs() * 30, span: 40 });
    }
  }
  return list;
}

/** Дорога: мокрый асфальт, бордюр, разметка, отражения фонарей и вывесок. */
function drawRoad(ctx, seed, x0, ppm) {
  const x1 = x0 + CW;
  // Тротуар и бордюр.
  vgrad(ctx, x0, 150, CW, 8, '#3a3a3c', '#2e2e30');
  for (let x = Math.floor(x0 / 18) * 18; x < x1; x += 18) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x, 150, 0.5, 8);
  }
  vgrad(ctx, x0, 157, CW, 3, '#8a8a86', '#4a4a48');
  // Асфальт — тёмный и мокрый, светлее у фонарей.
  vgrad(ctx, x0, 160, CW, 200, '#24262b', '#1a1b1f');
  for (let y = 160; y < 360; y += 2)
    for (let x = Math.floor(x0 / 2) * 2; x < x1; x += 2) {
      const v = hash(seed, x, y, 9);
      if (v < 0.05) {
        ctx.fillStyle = v < 0.025 ? '#2b2d32' : '#1d1e22';
        ctx.fillRect(x, y, 2, 1);
      }
    }
  // Разметка: сплошная у бордюра, прерывистая между полосами, сплошная у ближнего края.
  ctx.fillStyle = 'rgba(220,218,210,0.55)';
  ctx.fillRect(x0, 166, CW, 1.2);
  const period = 12 * ppm;
  for (let s = Math.floor(x0 / period) * period; s < x1; s += period) {
    ctx.fillStyle = 'rgba(225,222,214,0.7)';
    ctx.fillRect(s, 224, 3 * ppm, 2);
  }
  ctx.fillStyle = 'rgba(220,218,210,0.5)';
  ctx.fillRect(x0, 300, CW, 1.4);
  // Лужи и опавшие листья.
  for (let i = 0; i < 6; i++) {
    const px = x0 + hash(seed, x0, i, 77) * CW;
    const py = 236 + hash(seed, x0, i, 78) * 60;
    ctx.fillStyle = 'rgba(60,70,90,0.35)';
    ctx.beginPath();
    ctx.ellipse(px, py, 14 + hash(seed, x0, i, 79) * 20, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = ['#8a5e26', '#a0702c', '#6b4a22'][i % 3];
    ctx.fillRect(x0 + hash(seed, x0, i, 81) * CW, 160 + hash(seed, x0, i, 82) * 190, 1.6, 1);
  }
}

/** Провода троллейбуса и растяжки над дорогой. */
function drawWires(ctx, seed, x0) {
  const step = 180;
  ctx.strokeStyle = 'rgba(14,16,20,0.9)';
  ctx.lineWidth = 0.5;
  for (const y of [18, 24, 30]) {
    ctx.beginPath();
    ctx.moveTo(x0 - 2, y);
    ctx.lineTo(x0 + CW + 2, y);
    ctx.stroke();
  }
  for (let n = Math.floor(x0 / step) - 1; n * step < x0 + CW + step; n++) {
    const x = n * step + hash(seed, n, 51) * 20;
    // Подвес контактной сети: изолятор и растяжка к столбу за кадром.
    ctx.beginPath();
    ctx.moveTo(x - 30, 0);
    ctx.lineTo(x, 24);
    ctx.lineTo(x + 30, 0);
    ctx.stroke();
    ctx.fillStyle = '#3a3c40';
    ctx.fillRect(x - 1.4, 22, 2.8, 4);
    ctx.fillRect(x - 1.2, 28, 2.4, 3);
  }
}

function drawSky(ctx, seed, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#151a22');
  g.addColorStop(0.6, '#232a35');
  g.addColorStop(1, '#3a3530');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const r = rand(hash(seed, 7, 2026) * 2 ** 32);
  ctx.filter = 'blur(8px)';
  for (let i = 0; i < 26; i++) {
    const x = r() * w;
    const y = r() * h * 0.7;
    const rx = 40 + r() * 100;
    const ry = 8 + r() * 18;
    ctx.fillStyle = r() < 0.5 ? 'rgba(60,70,84,0.45)' : 'rgba(12,14,18,0.4)';
    for (const dx of [-w, 0, w]) {
      ctx.beginPath();
      ctx.ellipse(x + dx, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.filter = 'none';
  // Зарево города у горизонта.
  const gl = ctx.createLinearGradient(0, h * 0.55, 0, h);
  gl.addColorStop(0, 'rgba(255,150,70,0)');
  gl.addColorStop(1, 'rgba(255,150,70,0.18)');
  ctx.fillStyle = gl;
  ctx.fillRect(0, h * 0.55, w, h * 0.45);
}

// ---------- Мир ----------

export class CityWorld {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ seed: number, ppm: number }} opts
   */
  constructor(scene, { seed, ppm }) {
    this.scene = scene;
    this.seed = seed >>> 0;
    this.ppm = ppm;
    this.res = Phaser.Math.Clamp(Math.round(getRenderZoom() * 2) / 2, 1, 4);
    this.id = `cw${Math.floor(Math.random() * 1e9)}`;
    const skyKey = `${this.id}_sky`;
    const c = document.createElement('canvas');
    c.width = VIEW_W * this.res;
    c.height = 160 * this.res;
    const ctx = c.getContext('2d');
    ctx.scale(this.res, this.res);
    drawSky(ctx, this.seed, VIEW_W, 160);
    scene.textures.addCanvas(skyKey, c).setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.sky = scene.add
      .tileSprite(0, 0, VIEW_W, 160, skyKey)
      .setOrigin(0)
      .setTileScale(1 / this.res);
    this.layers = LAYERS.map((spec) => ({
      spec,
      box: scene.add.container(0, 0),
      chunks: new Map(),
      objects: new Map(),
      jobs: new Map(),
    }));
    // Провода — поверх тротуара, но под дорогой с машинами: переставим контейнер.
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    this.update(0, true);
  }

  /** Слой, над которым должны стоять машины (дорога). */
  get roadBox() {
    return this.layers.find((l) => l.spec.id === 'road').box;
  }

  #objects(layer, ci) {
    if (!layer.objects.has(ci)) layer.objects.set(ci, chunkObjects(this.seed, layer.spec, ci));
    return layer.objects.get(ci);
  }

  #start(layer, ci) {
    const { spec } = layer;
    const res = this.res;
    const c = document.createElement('canvas');
    c.width = CW * res;
    c.height = (spec.y1 - spec.y0) * res;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const x0 = ci * CW;
    ctx.setTransform(res, 0, 0, res, -x0 * res, -spec.y0 * res);
    if (spec.id === 'road') drawRoad(ctx, this.seed, x0, this.ppm);
    if (spec.id === 'street') fence(ctx, x0, x0 + CW);
    const objs = [ci - 1, ci, ci + 1]
      .flatMap((i) => this.#objects(layer, i))
      .filter((o) => o.x + (o.span ?? 200) > x0 - 40 && o.x - 60 < x0 + CW);
    const job = { layer, ci, c, ctx, x0, objs, i: 0 };
    layer.jobs.set(ci, job);
    return job;
  }

  #step(job, deadline) {
    const { ctx, objs } = job;
    while (job.i < objs.length) {
      const o = objs[job.i++];
      DRAW[o.kind]?.(ctx, { ...o, r: rand(o.seed ?? 1) });
      if (performance.now() > deadline) break;
    }
    if (job.i < objs.length) return false;
    this.#finish(job);
    return true;
  }

  #finish(job) {
    const { layer, ci, c, ctx, x0 } = job;
    const { spec } = layer;
    if (spec.id === 'wires') drawWires(ctx, this.seed, x0);
    if (spec.id === 'far') {
      // Дымка над дальними домами.
      const g = ctx.createLinearGradient(0, 60, 0, 160);
      g.addColorStop(0, 'rgba(40,46,56,0)');
      g.addColorStop(1, 'rgba(60,56,52,0.45)');
      ctx.fillStyle = g;
      ctx.fillRect(x0, 60, CW, 100);
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
  }

  /** Кадр: сдвиг слоёв по пути (точки мира), подгрузка и уборка кусков. */
  update(scroll, now = false) {
    this.sky.tilePositionX = scroll * 0.02 * this.res;
    const pending = [];
    for (const layer of this.layers) {
      const s = scroll * layer.spec.k;
      layer.box.x = -s;
      const first = Math.floor(s / CW);
      const last = Math.floor((s + VIEW_W) / CW);
      for (let ci = first - (now ? 1 : 0); ci <= last + 1; ci++) {
        if (layer.chunks.has(ci)) continue;
        const job = layer.jobs.get(ci) ?? this.#start(layer, ci);
        if ((ci <= last && ci >= first) || now) this.#step(job, Infinity);
        else pending.push(job);
      }
      for (const [ci, img] of layer.chunks) {
        if (ci >= first - 1) continue;
        const key = img.texture.key;
        img.destroy();
        this.scene.textures.remove(key);
        layer.chunks.delete(ci);
        layer.objects.delete(ci - 2);
      }
    }
    const deadline = performance.now() + 5;
    for (const job of pending) {
      if (performance.now() > deadline) break;
      this.#step(job, deadline);
    }
  }

  destroy() {
    for (const layer of this.layers) {
      for (const img of layer.chunks.values()) {
        const key = img.texture.key;
        img.destroy();
        this.scene.textures.remove(key);
      }
    }
    this.scene.textures.remove(`${this.id}_sky`);
    this.layers = [];
  }
}

export { ROAD_TOP };
