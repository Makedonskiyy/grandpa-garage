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
function neon(ctx, text, x, y, size, color, align = 'center') {
  ctx.save();
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 1.4;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = size * 0.5;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = '#fff6e8';
  ctx.fillText(text, x, y);
  ctx.restore();
}

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

/** Витрины и вывески первого этажа. */
function shopFloor(ctx, r, x, w, base, h, wall) {
  vgrad(ctx, x, base - h, w, h, wall, '#2b2a28');
  const n = Math.max(1, Math.floor(w / 46));
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    const sx = x + i * sw;
    const lit = r() < 0.65;
    // Витрина и дверь.
    ctx.fillStyle = '#121418';
    ctx.fillRect(sx + 4, base - h + 9, sw - 8, h - 10);
    if (lit) {
      vgrad(
        ctx,
        sx + 5,
        base - h + 10,
        sw - 10,
        h - 12,
        'rgba(255,220,160,0.75)',
        'rgba(255,190,120,0.35)',
      );
      ctx.fillStyle = 'rgba(40,30,20,0.5)';
      for (let k = 0; k < 3; k++)
        ctx.fillRect(sx + 7 + k * ((sw - 14) / 3), base - h + 14 + (k % 2) * 3, 3, h - 18);
    }
    ctx.fillStyle = '#3a3c40';
    ctx.fillRect(sx + sw / 2 - 0.4, base - h + 10, 0.8, h - 12);
    // Вывеска над витриной.
    if (r() < 0.75) {
      const [text, color] = pick(r, SIGNS);
      ctx.fillStyle = '#16171a';
      ctx.fillRect(sx + 3, base - h + 1.5, sw - 6, 7);
      const size = Math.min(5.4, ((sw - 10) / text.length) * 1.55);
      neon(ctx, text, sx + sw / 2, base - h + 5, size, color);
      glow(ctx, sx + sw / 2, base - h + 6, sw * 0.8, 10, hexToRgb(color), 0.12);
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

/** Хрущёвка: 5 этажей, панели или белый кирпич, балконы (застеклённые и открытые), антенны. */
function khrushchevka(ctx, o) {
  const { x, w, r } = o;
  const base = SIDEWALK;
  const floors = 5;
  const fh = 12;
  const H = floors * fh + 16;
  const top = base - H;
  const brick = r() < 0.45;
  const wall = brick ? '#b8b2a4' : pick(r, ['#8b8f93', '#9a9c9a', '#7f8488']);
  vgrad(ctx, x, top, w, H, wall, brick ? '#7a766c' : '#5a5d61');
  if (brick) {
    for (let y = top; y < base - 16; y += 1.6) {
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.fillRect(x, y, w, 0.3);
    }
  } else {
    // Швы панелей.
    for (let f = 0; f <= floors; f++) {
      ctx.fillStyle = 'rgba(20,20,20,0.35)';
      ctx.fillRect(x, top + 4 + f * fh, w, 0.5);
    }
    for (let px = x; px < x + w; px += 18) {
      ctx.fillStyle = 'rgba(20,20,20,0.3)';
      ctx.fillRect(px, top + 4, 0.5, H - 20);
    }
  }
  // Плоская крыша, антенны, тарелки.
  ctx.fillStyle = '#4b4d50';
  ctx.fillRect(x - 1, top - 1, w + 2, 3);
  for (let i = 0; i < 3 + w / 50; i++) {
    const ax = x + 6 + r() * (w - 12);
    ctx.strokeStyle = '#2a2c30';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(ax, top - 1);
    ctx.lineTo(ax, top - 10 - r() * 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ax - 3, top - 7);
    ctx.lineTo(ax + 3, top - 7);
    ctx.moveTo(ax - 2, top - 9);
    ctx.lineTo(ax + 2, top - 9);
    ctx.stroke();
  }
  // Окна и балконы.
  const cols = Math.max(4, Math.floor(w / 11));
  const cw = w / cols;
  for (let f = 0; f < floors - 1; f++) {
    const fy = top + 5 + f * fh;
    for (let cI = 0; cI < cols; cI++) {
      const wx = x + cI * cw + cw * 0.2;
      const ww = cw * 0.6;
      windowPane(ctx, r, wx, fy + 2, ww, fh - 5, brick ? '#6a655c' : '#4c4f53');
      if (cI % 3 === 1) {
        // Балкон: открытый с бельём или застеклённый «как у всех».
        const glazed = r() < 0.55;
        ctx.fillStyle = glazed ? '#c8c6bd' : '#5d6064';
        ctx.fillRect(wx - 2, fy + fh - 5.5, ww + 4, 5);
        if (glazed) {
          ctx.fillStyle = r() < 0.3 ? '#e8c27a' : '#263040';
          ctx.fillRect(wx - 1.4, fy + fh - 9, ww + 2.8, 3.4);
        } else if (r() < 0.4) {
          ctx.fillStyle = pick(r, ['#c94a3a', '#3f6fa0', '#e8e2d2']);
          ctx.fillRect(wx, fy + fh - 9, 1.6, 3);
          ctx.fillRect(wx + 3, fy + fh - 9, 1.6, 2.4);
        }
      }
    }
  }
  // Спутниковые тарелки на фасаде.
  for (let i = 0; i < 2 + w / 60; i++) {
    ctx.fillStyle = '#dcdad4';
    ctx.beginPath();
    ctx.ellipse(x + 4 + r() * (w - 8), top + 10 + r() * (H - 36), 1.8, 2.2, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  shopFloor(ctx, r, x, w, base, 15, brick ? '#8a857a' : '#6d7073');
  // Рекламный щит на крыше.
  if (o.ad) {
    const [title, sub, bg, fg] = o.ad;
    const bw = Math.min(w - 10, 90);
    const bx = x + (w - bw) / 2;
    ctx.fillStyle = '#2a2c30';
    ctx.fillRect(bx + 8, top - 10, 1.2, 10);
    ctx.fillRect(bx + bw - 9, top - 10, 1.2, 10);
    ctx.fillRect(bx - 1, top - 33, bw + 2, 24);
    vgrad(ctx, bx, top - 32, bw, 22, bg, bg);
    glow(ctx, bx + bw / 2, top - 21, bw * 0.7, 16, '255,240,210', 0.2);
    ctx.font = `800 9px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fg;
    ctx.fillText(title, bx + bw / 2, top - 24);
    ctx.font = `500 5px ${FONT}`;
    ctx.fillText(sub, bx + bw / 2, top - 15);
    // Прожекторы снизу.
    for (const lx of [bx + 10, bx + bw - 12]) glow(ctx, lx, top - 12, 8, 4, '255,240,200', 0.4);
  }
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

function metro(ctx, o) {
  const { x } = o;
  const base = SIDEWALK + 2;
  const w = 46;
  vgrad(ctx, x, base - 26, w, 26, '#3a3d42', '#24262a');
  ctx.fillStyle = '#9fd2a8';
  ctx.globalAlpha = 0.45;
  ctx.fillRect(x + 6, base - 14, w - 12, 14);
  ctx.globalAlpha = 1;
  glow(ctx, x + w / 2, base - 6, 30, 12, '170,255,190', 0.25);
  ctx.fillStyle = '#1b1c1f';
  ctx.fillRect(x - 2, base - 30, w + 4, 6);
  neon(ctx, 'ПЕРЕХОД', x + w / 2, base - 27, 4.4, '#f4f0e6');
  neon(ctx, 'М', x + w / 2, base - 38, 10, '#ff2a2a');
  glow(ctx, x + w / 2, base - 38, 18, 14, '255,40,40', 0.3);
}

function kiosk(ctx, o) {
  const { x, r } = o;
  const base = SIDEWALK + 2;
  const w = 40;
  vgrad(ctx, x, base - 24, w, 24, '#cfc8b6', '#8f8878');
  ctx.fillStyle = '#16171a';
  ctx.fillRect(x + 3, base - 19, w - 6, 11);
  vgrad(ctx, x + 4, base - 18, w - 8, 9, 'rgba(255,220,160,0.85)', 'rgba(255,190,120,0.5)');
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = pick(r, ['#c94a3a', '#2f6fb0', '#e0a13a', '#3d8a5a', '#f2efe6']);
    ctx.fillRect(x + 5 + i * 3.4, base - 17 + (i % 3) * 2.6, 2.4, 2);
  }
  ctx.fillStyle = '#b23a2a';
  ctx.fillRect(x - 1, base - 28, w + 2, 5);
  neon(
    ctx,
    pick(r, ['ОБМЕН ВАЛЮТ', 'ПЕЧАТЬ', 'ЦВЕТЫ 24', 'ТАБАК']),
    x + w / 2,
    base - 25.5,
    3.6,
    '#fff3d6',
  );
  glow(ctx, x + w / 2, base - 12, 30, 12, '255,200,130', 0.25);
}

function fence(ctx, x0, x1) {
  const base = SIDEWALK + 2;
  ctx.fillStyle = '#2a2c30';
  ctx.fillRect(x0, base - 10, x1 - x0, 0.8);
  ctx.fillRect(x0, base - 2, x1 - x0, 0.8);
  for (let x = Math.ceil(x0 / 2.2) * 2.2; x < x1; x += 2.2) ctx.fillRect(x, base - 10, 0.5, 9);
  for (let x = Math.ceil(x0 / 44) * 44; x < x1; x += 44) ctx.fillRect(x - 0.5, base - 11, 1.4, 11);
}

function poleAd(ctx, o) {
  const { x, r } = o;
  const base = SIDEWALK + 2;
  const [title, sub, bg, fg] = pick(r, ROOF_ADS);
  ctx.fillStyle = '#2a2c30';
  ctx.fillRect(x + 13, base - 40, 2.4, 40);
  ctx.fillRect(x - 1, base - 72, 30, 34);
  vgrad(ctx, x, base - 71, 28, 32, bg, bg);
  glow(ctx, x + 14, base - 55, 24, 24, '255,240,210', 0.18);
  ctx.save();
  ctx.translate(x + 14, base - 55);
  ctx.font = `800 4.6px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fg;
  const words = title.split(' ');
  words.forEach((wd, i) => ctx.fillText(wd, 0, -4 + i * 5.4 - (words.length - 1) * 2));
  ctx.font = `500 2.8px ${FONT}`;
  ctx.fillText(sub, 0, 10);
  ctx.restore();
}

const DRAW = {
  stalinka,
  khrushchevka,
  far: farBlock,
  light: streetLight,
  tree: autumnTree,
  shelter: busShelter,
  metro,
  kiosk,
  poleAd,
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
        add({ kind: 'khrushchevka', x, w, ad: r() < 0.3 ? pick(r, ROOF_ADS) : null, span: w + 10 });
      x += w + (r() < 0.25 ? 14 + r() * 20 : 0);
    }
  } else if (spec.id === 'street') {
    // Фонари — ровным шагом, между ними — деревья, остановки, метро, ларьки, щиты.
    const step = 150;
    for (let n = Math.floor(x0 / step); n * step < x0 + CW; n++) {
      const lx = n * step + 20;
      if (lx >= x0 && lx < x0 + CW) add({ kind: 'light', x: lx, span: 50 });
      const rs = rand(hash(seed, n, 919) * 2 ** 32);
      const mid = n * step + 60;
      if (mid < x0 || mid >= x0 + CW) continue;
      const v = rs();
      if (v < 0.16) add({ kind: 'metro', x: mid, span: 60 });
      else if (v < 0.36) add({ kind: 'shelter', x: mid, span: 70 });
      else if (v < 0.5) add({ kind: 'kiosk', x: mid + 10, span: 50 });
      else if (v < 0.6) add({ kind: 'poleAd', x: mid + 20, span: 40 });
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
  // Отражения в мокром асфальте: мягкие вытянутые блики под фонарями и вывесками.
  const streak = (x, y, len, col, a) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(5, len);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(' + col + ',' + a + ')');
    g.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  const step = 150 / 0.62;
  for (let s = Math.floor((x0 - 60) / step) * step; s < x1 + 60; s += step) {
    streak(s + 19, 196, 46, '255,165,75', 0.16);
    ctx.fillStyle = 'rgba(255,170,80,0.06)';
    ctx.beginPath();
    ctx.ellipse(s + 19, 200, 60, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let m = Math.floor(x0 / 37); m * 37 < x1; m++) {
    const h = hash(seed, m, 4040);
    if (h > 0.3) continue;
    const col = ['76,255,138', '255,59,59', '255,216,74', '90,200,255'][Math.floor(h * 13) % 4];
    streak(m * 37 + 6, 176, 18, col, 0.1);
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
