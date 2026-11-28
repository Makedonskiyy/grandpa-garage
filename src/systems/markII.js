/**
 * Toyota Mark II (X100) Палыча — вид сбоку, нарисован кодом на canvas по фото-референсу
 * (art/source/mark2-reference.png). Временный вариант: потом заменим генератором по чертежу,
 * как машину игрока. Тёмная бронза, тонированные стёкла, кованые пятиспицевые диски,
 * юбки и низкая посадка.
 *
 * Размер в точках мира: длина 300 (≈4,8 м при масштабе машины игрока), точка (0, 0) —
 * земля под серединой машины, перед — вправо.
 */
import Phaser from 'phaser';
import drivers from '../../data/drivers.json';
import { groundShadow } from './groundShadow.js';

const RES = 3; // во сколько раз холст детальнее мира
const L = 300;
const H = 92;
const GROUND = 90;
const AXLES = [68, 236];
const WHEEL_R = 20;
const STRETCH = 1.24; // высота кузова над порогом относительно исходного контура
export const MARK2 = Object.freeze({ visibleLength: 293, lengthMm: 4760 });

const BODY = '#86685a';
const BODY_HI = '#b5958a';
const BODY_LO = '#4e3a31';

/** Контур кузова (x от заднего бампера, y от верха). */
const PROFILE = [
  [5, 56],
  [8, 48],
  [14, 45],
  [58, 41],
  [66, 40],
  [96, 22],
  [104, 20],
  [166, 19],
  [176, 21],
  [208, 41],
  [252, 46],
  [284, 50],
  [294, 54],
  [298, 62],
  [296, 72],
  [288, 80],
  [262, 80],
  [258, 70],
  [250, 60],
  [236, 55],
  [222, 60],
  [214, 70],
  [211, 80],
  [91, 80],
  [88, 70],
  [80, 60],
  [68, 55],
  [54, 60],
  [46, 70],
  [44, 80],
  [12, 80],
  [5, 72],
];

function path(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function bodyTexture(scene) {
  const key = 'rival_mark2';
  if (scene.textures.exists(key)) return key;
  const c = document.createElement('canvas');
  c.width = L * RES;
  c.height = H * RES;
  const ctx = c.getContext('2d');
  ctx.scale(RES, RES);
  // Пропорции X100: длина к высоте ≈ 3,4. Кузов тянем вверх от порогов, колёса и арки — нет.
  ctx.save();
  ctx.translate(0, 80);
  ctx.scale(1, STRETCH);
  ctx.translate(0, -80);

  // Кузов: металлик сверху светлее, к порогу темнее; блик по линии плеча.
  path(ctx, PROFILE);
  const g = ctx.createLinearGradient(0, 18, 0, 82);
  g.addColorStop(0, BODY_HI);
  g.addColorStop(0.28, BODY);
  g.addColorStop(0.62, '#765a4c');
  g.addColorStop(1, BODY_LO);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  path(ctx, PROFILE);
  ctx.clip();
  // Линия плеча: светлая грань и тень под ней.
  ctx.fillStyle = 'rgba(255,240,230,0.28)';
  ctx.fillRect(0, 46.5, L, 1.2);
  ctx.fillStyle = 'rgba(40,24,18,0.25)';
  ctx.fillRect(0, 48, L, 2.5);
  // Отражение неба на капоте и крышке багажника.
  const sky = ctx.createLinearGradient(0, 38, 0, 52);
  sky.addColorStop(0, 'rgba(255,255,255,0.22)');
  sky.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sky;
  ctx.fillRect(208, 40, 90, 12);
  ctx.fillRect(8, 41, 58, 8);
  // Юбки: тёмная пластиковая накладка по низу.
  ctx.fillStyle = '#3a2c25';
  ctx.fillRect(0, 74, L, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, 74, L, 0.8);
  ctx.restore();
  ctx.strokeStyle = '#2a1d17';
  ctx.lineWidth = 0.8;
  path(ctx, PROFILE);
  ctx.stroke();

  // Стёкла: тонированные, с хромовой рамкой и отражением.
  const glass = [
    [70, 41],
    [98, 24],
    [165, 23],
    [174, 25],
    [201, 41],
  ];
  path(ctx, glass);
  const gl = ctx.createLinearGradient(0, 23, 0, 41);
  gl.addColorStop(0, '#2a2f36');
  gl.addColorStop(1, '#0c0e11');
  ctx.fillStyle = gl;
  ctx.fill();
  ctx.strokeStyle = '#c9c4bd';
  ctx.lineWidth = 0.7;
  path(ctx, glass);
  ctx.stroke();
  ctx.save();
  path(ctx, glass);
  ctx.clip();
  // Палыч за стеклом передней двери.
  const { palette, pixels } = drivers.palych;
  const [left, top, pixel] = [143, 24, 0.72];
  for (const [row, line] of pixels.entries()) {
    for (const [col, ink] of [...line].entries()) {
      if (!palette[ink]) continue;
      ctx.fillStyle = palette[ink];
      ctx.fillRect(left + col * pixel, top + row * pixel, pixel, pixel);
    }
  }
  ctx.fillStyle = 'rgba(16,24,31,0.28)';
  ctx.fillRect(139, 23, 62, 18);
  ctx.fillStyle = 'rgba(190,205,220,0.16)';
  ctx.beginPath();
  ctx.moveTo(110, 23);
  ctx.lineTo(126, 23);
  ctx.lineTo(108, 41);
  ctx.lineTo(92, 41);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Стойки B и C, форточка.
  ctx.fillStyle = '#121416';
  ctx.fillRect(135, 23, 4, 18);
  ctx.beginPath();
  ctx.moveTo(84, 41);
  ctx.lineTo(96, 28);
  ctx.lineTo(99, 28);
  ctx.lineTo(89, 41);
  ctx.closePath();
  ctx.fill();

  // Двери: швы, ручки, зеркало.
  ctx.strokeStyle = 'rgba(30,18,14,0.75)';
  ctx.lineWidth = 0.6;
  for (const [x0, x1] of [
    [137, 140],
    [205, 206],
    [90, 88],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x0, 42);
    ctx.lineTo(x1, 74);
    ctx.stroke();
  }
  ctx.fillStyle = '#d8d2c8';
  ctx.fillRect(124, 51, 7, 1.6);
  ctx.fillRect(190, 51, 7, 1.6);
  ctx.fillStyle = BODY;
  ctx.beginPath();
  ctx.moveTo(196, 41);
  ctx.lineTo(206, 37);
  ctx.lineTo(209, 41);
  ctx.lineTo(204, 44);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2a1d17';
  ctx.fillRect(199, 41, 7, 1);

  // Фары: передняя — прозрачная с линзой, задний фонарь — красный.
  ctx.fillStyle = '#1a1a1c';
  ctx.beginPath();
  ctx.moveTo(276, 50);
  ctx.lineTo(292, 53);
  ctx.lineTo(296, 58);
  ctx.lineTo(280, 57);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#eef0f2';
  ctx.beginPath();
  ctx.ellipse(288, 55, 3.2, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e59a2a';
  ctx.fillRect(282, 60, 8, 2);
  ctx.fillStyle = '#3a0c0a';
  ctx.fillRect(5, 48, 12, 9);
  ctx.fillStyle = '#c81d1d';
  ctx.fillRect(6, 49, 10, 7);
  ctx.fillStyle = 'rgba(255,170,160,0.6)';
  ctx.fillRect(7, 50, 3, 2);
  // Бамперы: решётка внизу спереди, выхлоп сзади.
  ctx.fillStyle = '#1a1a1c';
  ctx.fillRect(284, 66, 12, 5);
  ctx.fillStyle = '#9da1a6';
  ctx.beginPath();
  ctx.ellipse(16, 79, 3, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  // Арки: тёмная глубина ниш колёс.
  for (const ax of AXLES) {
    ctx.fillStyle = '#0b0a09';
    ctx.beginPath();
    ctx.arc(ax, 70, WHEEL_R + 3, Math.PI, 0);
    ctx.lineTo(ax + WHEEL_R + 3, 80);
    ctx.lineTo(ax - WHEEL_R - 3, 80);
    ctx.closePath();
    ctx.fill();
  }

  scene.textures.addCanvas(key, c).setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

/** Кованый пятиспицевый диск в шине. */
function wheelTexture(scene) {
  const key = 'rival_mark2_wheel';
  if (scene.textures.exists(key)) return key;
  const S = (WHEEL_R + 1) * 2;
  const c = document.createElement('canvas');
  c.width = S * RES;
  c.height = S * RES;
  const ctx = c.getContext('2d');
  ctx.scale(RES, RES);
  const o = S / 2;
  ctx.fillStyle = '#0d0d0f';
  ctx.beginPath();
  ctx.arc(o, o, WHEEL_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#25262a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(o, o, WHEEL_R - 2.2, 0, Math.PI * 2);
  ctx.stroke();
  const rim = WHEEL_R - 4.5;
  const rg = ctx.createRadialGradient(o - 3, o - 3, 1, o, o, rim);
  rg.addColorStop(0, '#d9dde2');
  rg.addColorStop(1, '#8e939a');
  ctx.fillStyle = '#2a2c30';
  ctx.beginPath();
  ctx.arc(o, o, rim, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rg;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(o, o, rim - 0.6, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const w = 0.34;
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(o + Math.cos(a - w) * 3.6, o + Math.sin(a - w) * 3.6);
    ctx.lineTo(o + Math.cos(a - 0.16) * (rim - 1), o + Math.sin(a - 0.16) * (rim - 1));
    ctx.lineTo(o + Math.cos(a + 0.16) * (rim - 1), o + Math.sin(a + 0.16) * (rim - 1));
    ctx.lineTo(o + Math.cos(a + w) * 3.6, o + Math.sin(a + w) * 3.6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#b9bec4';
  ctx.beginPath();
  ctx.arc(o, o, 3.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a3c41';
  ctx.beginPath();
  ctx.arc(o, o, 1.4, 0, Math.PI * 2);
  ctx.fill();
  scene.textures.addCanvas(key, c).setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

/**
 * Mark II Палыча.
 * @param {Phaser.Scene} scene
 * @param {{ x?: number, y?: number, scale?: number, night?: boolean }} [opts]
 */
export function buildMarkII(scene, opts = {}) {
  const car = scene.add.container(opts.x ?? 0, opts.y ?? 0);
  const left = -L / 2;
  car.add(
    groundShadow(
      scene,
      L,
      AXLES.map((axle) => left + axle),
    ),
  );
  if (opts.night) {
    // Свет фар — мягкий конус вперёд, габариты сзади.
    const cone = scene.add.triangle(L / 2 - 6, -42, 0, 0, 200, -30, 200, 30, 0xffe8b0, 0.08);
    cone.setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD);
    const tail = scene.add
      .ellipse(left + 8, -50, 22, 12, 0xff2a1f, 0.35)
      .setBlendMode(Phaser.BlendModes.ADD);
    car.add([cone, tail]);
  }
  car.add(
    scene.add
      .image(left, -GROUND, bodyTexture(scene))
      .setOrigin(0)
      .setScale(1 / RES),
  );
  const wheelKey = wheelTexture(scene);
  car.wheels = AXLES.map((ax) => {
    const w = scene.add.image(left + ax, -WHEEL_R, wheelKey).setScale(1 / RES);
    car.add(w);
    return w;
  });
  car.wheelR = WHEEL_R;
  car.setScale(opts.scale ?? 1);
  return car;
}
