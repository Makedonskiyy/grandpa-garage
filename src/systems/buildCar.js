/**
 * buildCar — единая точка сборки машины игрока для всех сцен (ТЗ 5.2).
 * Сама машина — CarRig (пиксельные слои из tools/build-car.mjs + физика показа).
 *
 * Здесь же пока живёт заглушка «девятки» Палыча, нарисованная примитивами:
 * её заменит такой же генератор, как у машины игрока.
 */
import Phaser from 'phaser';
import { CarRig } from './CarRig.js';

/**
 * @param {Phaser.Scene} scene
 * @param {object} build сборка из gameState
 * @param {object} looks косметика из gameState
 * @param {{ x?: number, y?: number, scale?: number, night?: boolean, dirty?: boolean }} [opts]
 * @returns {CarRig}
 */
export function buildCar(scene, build, looks, opts = {}) {
  return new CarRig(scene, opts.x ?? 0, opts.y ?? 0, {
    build,
    looks,
    dirty: opts.dirty,
    night: opts.night,
    scale: opts.scale,
  });
}

const RIVAL_WHEEL_R = 13;
const RW = 210; // ширина текстуры «девятки», точек мира
const RH = 64;
const AXLES = [46, 160]; // оси от заднего бампера

/** Крутит колёса «девятки» пропорционально пройденному пути (в пикселях). */
export function spinWheels(car, dx) {
  for (const w of car.wheels) w.rotation += dx / RIVAL_WHEEL_R;
}

/**
 * «Девятка» Палыча (ТЗ 2.1) — пиксельный вишнёвый хэтчбек-клин: длинный капот,
 * крутая пятая дверь, чёрные пластиковые бамперы и молдинги, квадратные фары.
 * Рисуется кодом в текстуру один раз; колёса — отдельные спрайты, крутятся.
 */
function rivalTexture(scene) {
  if (scene.textures.exists('rival_vaz')) return 'rival_vaz';
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const C = {
    ink: 0x15090c,
    paint: 0x8b1a2b,
    hi: 0xb6303f,
    hi2: 0xd34a57,
    shade: 0x611221,
    deep: 0x430c17,
    glass: 0x1d2a36,
    glassHi: 0x5f7d92,
    rubber: 0x1b1b1d,
    chrome: 0xb9bec4,
    lamp: 0xffe8b0,
    tail: 0xc8262e,
    arch: 0x0b0b0c,
  };
  const poly = (pts, color) =>
    g.fillStyle(color).fillPoints(
      pts.map(([x, y]) => ({ x, y })),
      true,
    );
  // Силуэт: клин — низкий капот спереди (справа), крыша назад, крутая пятая дверь.
  const body = [
    [6, 50],
    [4, 40],
    [8, 30],
    [16, 24],
    [42, 9],
    [112, 7],
    [124, 9],
    [148, 25],
    [200, 31],
    [206, 36],
    [207, 50],
    [6, 50],
  ];
  poly(
    body.map(([x, y]) => [x, y - 1]),
    C.ink,
  );
  poly(
    body.map(([x, y]) => [x + (x < 100 ? 1 : -1), y]),
    C.paint,
  );
  // Свет сверху: светлая полоса по крыше и капоту, тень по низу борта.
  poly(
    [
      [44, 10],
      [112, 8],
      [122, 10],
      [120, 12],
      [46, 13],
    ],
    C.hi2,
  );
  poly(
    [
      [148, 26],
      [200, 32],
      [200, 34],
      [146, 29],
    ],
    C.hi,
  );
  poly(
    [
      [10, 38],
      [204, 38],
      [204, 50],
      [8, 50],
    ],
    C.shade,
  );
  poly(
    [
      [8, 46],
      [205, 46],
      [205, 50],
      [8, 50],
    ],
    C.deep,
  );
  // Стёкла: заднее (пятая дверь), задняя форточка, передняя дверь, лобовое.
  poly(
    [
      [17, 26],
      [41, 12],
      [52, 12],
      [52, 26],
    ],
    C.glass,
  );
  poly(
    [
      [56, 12],
      [92, 11],
      [92, 26],
      [56, 26],
    ],
    C.glass,
  );
  poly(
    [
      [96, 11],
      [114, 10],
      [138, 25],
      [96, 26],
    ],
    C.glass,
  );
  poly(
    [
      [118, 10],
      [124, 10],
      [146, 25],
      [140, 25],
    ],
    C.glass,
  );
  g.fillStyle(C.glassHi).fillRect(60, 13, 14, 2);
  g.fillStyle(C.glassHi).fillRect(100, 13, 10, 2);
  g.fillStyle(C.ink).fillRect(53, 11, 3, 16); // стойки
  g.fillStyle(C.ink).fillRect(92, 11, 4, 16);
  // Молдинг и бамперы — чёрный пластик.
  g.fillStyle(C.rubber).fillRect(8, 33, 198, 3);
  g.fillStyle(C.rubber).fillRect(2, 40, 14, 10);
  g.fillStyle(C.rubber).fillRect(196, 38, 12, 12);
  // Швы дверей и ручки.
  g.fillStyle(C.ink).fillRect(94, 26, 1, 20);
  g.fillStyle(C.ink).fillRect(54, 26, 1, 20);
  g.fillStyle(C.ink).fillRect(146, 27, 1, 18);
  g.fillStyle(C.chrome).fillRect(84, 29, 6, 2);
  g.fillStyle(C.chrome).fillRect(44, 29, 6, 2);
  // Фара квадратная, поворотник, задний фонарь.
  g.fillStyle(C.ink).fillRect(195, 30, 12, 7);
  g.fillStyle(C.lamp).fillRect(196, 31, 10, 5);
  g.fillStyle(0xffffff).fillRect(197, 32, 3, 2);
  g.fillStyle(0xe8902a).fillRect(196, 37, 6, 2);
  g.fillStyle(C.ink).fillRect(4, 28, 7, 10);
  g.fillStyle(C.tail).fillRect(5, 29, 5, 8);
  g.fillStyle(0xff7a7a).fillRect(6, 30, 2, 2);
  // Арки колёс.
  for (const ax of AXLES) {
    g.fillStyle(C.arch).fillCircle(ax, 50, 16);
    g.fillStyle(C.ink).fillRect(ax - 17, 50, 34, 1);
  }
  g.fillStyle(0x000000, 0).fillRect(0, 51, RW, RH - 51);
  // Срезать низ арок — ниже порога пусто.
  g.generateTexture('rival_vaz', RW, RH);
  g.destroy();
  return 'rival_vaz';
}

/** Колесо «девятки»: шина и штампованный диск с колпаком. */
function rivalWheelTexture(scene) {
  if (scene.textures.exists('rival_wheel')) return 'rival_wheel';
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const R = RIVAL_WHEEL_R;
  const c = R + 1;
  g.fillStyle(0x0d0d0f).fillCircle(c, c, R);
  g.fillStyle(0x222327).fillCircle(c, c, R - 2);
  g.fillStyle(0x8d9096).fillCircle(c, c, R - 5);
  g.fillStyle(0x6c6f75).fillCircle(c, c, R - 7);
  g.fillStyle(0xb9bdc3).fillCircle(c, c, 3);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    g.fillStyle(0x3a3c41).fillRect(c + Math.cos(a) * 5 - 1, c + Math.sin(a) * 5 - 1, 3, 3);
  }
  g.generateTexture('rival_wheel', c * 2, c * 2);
  g.destroy();
  return 'rival_wheel';
}

/** «Девятка» Палыча. Точка (0, 0) — земля под серединой машины. */
export function buildRivalCar(scene, opts = {}) {
  const car = scene.add.container(opts.x ?? 0, opts.y ?? 0);
  if (opts.night) {
    const cone = scene.add.triangle(RW / 2 - 4, -26, 0, 0, 170, -26, 170, 26, 0xffe8b0, 0.07);
    cone.setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD);
    car.add(cone);
  }
  car.add(scene.add.ellipse(0, 0, RW - 10, 8, 0x000000, 0.5));
  car.add(scene.add.image(-RW / 2, -RH + 13, rivalTexture(scene)).setOrigin(0));
  const wheelKey = rivalWheelTexture(scene);
  car.wheels = AXLES.map((ax) => {
    const w = scene.add.image(ax - RW / 2, -RIVAL_WHEEL_R, wheelKey);
    car.add(w);
    return w;
  });
  car.setScale(opts.scale ?? 1);
  return car;
}
