/**
 * buildCar — машина игрока из слоёв (ТЗ 5.1, 5.2). Одна функция для всех сцен,
 * поэтому машина выглядит одинаково в гараже, на обкатке, в заезде и в финале.
 *
 * Слои снизу вверх: neon → wheel_back/wheel_front (шина + rim) → body + paint → overlay → headlight.
 * Пока арта нет, каждый слой рисуется примитивами-заглушками того же размера (~200×70).
 * Когда появятся спрайты, заменяется только содержимое функций draw* — интерфейс остаётся.
 */
import Phaser from 'phaser';
import cosmetics from '../../data/cosmetics.json';
import { getPart } from './simulate.js';

export const CAR_WIDTH = 200;
export const CAR_HEIGHT = 70;

const hex = (h) => Phaser.Display.Color.HexStringToColor(h).color;

function findCosmetic(group, id) {
  return cosmetics[group].find((c) => c.id === id) ?? cosmetics[group][0];
}

// Точка привязки контейнера — середина низа машины (уровень земли).
const WHEEL_Y = -12;
const WHEEL_R = 12;
const WHEEL_BACK_X = -62;
const WHEEL_FRONT_X = 60;

function drawNeon(scene, color) {
  const neon = scene.add.ellipse(0, -2, CAR_WIDTH - 10, 14, hex(color), 0.7);
  neon.setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({ targets: neon, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 });
  return neon;
}

function drawWheel(scene, x, wheelsPart, rimColor) {
  const c = scene.add.container(x, WHEEL_Y);
  const tire = scene.add.circle(0, 0, WHEEL_R, 0x111114);
  c.add(tire);
  if (wheelsPart?.id === 'wheels_studded') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.add(scene.add.rectangle(Math.cos(a) * 11, Math.sin(a) * 11, 2, 2, 0xb8bcc4));
    }
  }
  const rimRadius = wheelsPart?.id === 'wheels_slicks' ? 8 : 6;
  c.add(scene.add.circle(0, 0, rimRadius, hex(rimColor)));
  c.add(scene.add.rectangle(0, 0, 2, rimRadius * 2 - 2, 0x000000, 0.35));
  c.add(scene.add.rectangle(0, 0, rimRadius * 2 - 2, 2, 0x000000, 0.35));
  c.setName('wheel');
  return c;
}

function drawBody(scene, paintColor) {
  const g = scene.add.graphics();
  // Обводка/основа кузова — купэ без марок и логотипов.
  g.fillStyle(0x0c0c10, 1);
  g.fillRect(-98, -44, 196, 30);
  g.fillRect(-52, -64, 96, 22);
  // Слой краски.
  g.fillStyle(hex(paintColor), 1);
  g.fillRect(-96, -42, 192, 26);
  g.fillRect(-50, -62, 92, 20);
  // Стёкла.
  g.fillStyle(0x9fc4d8, 1);
  g.fillRect(-44, -58, 38, 14);
  g.fillRect(0, -58, 36, 14);
  // Блик.
  g.fillStyle(0xffffff, 0.25);
  g.fillRect(-96, -42, 192, 3);
  return g;
}

function drawOverlay(scene, bodyPart) {
  const g = scene.add.graphics();
  switch (bodyPart?.id) {
    case 'body_rusty':
      g.fillStyle(0x7a3b17, 0.9);
      [
        [-80, -24, 10, 5],
        [-30, -20, 6, 4],
        [30, -36, 8, 4],
        [70, -22, 12, 5],
      ].forEach(([x, y, w, h]) => g.fillRect(x, y, w, h));
      break;
    case 'body_cage':
      g.fillStyle(0x5d6168, 1);
      g.fillRect(-96, -18, 192, 4);
      g.fillRect(-6, -62, 4, 20);
      break;
    case 'body_light':
      g.fillStyle(0x0c0c10, 1);
      g.fillRect(-104, -54, 20, 4);
      g.fillRect(-96, -50, 3, 8);
      break;
    default:
      break;
  }
  return g;
}

function drawHeadlight(scene, color, night) {
  const c = scene.add.container(0, 0);
  if (night) {
    const cone = scene.add.triangle(96, -30, 0, 0, 160, -26, 160, 26, hex(color), 0.18);
    cone.setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD);
    c.add(cone);
  }
  c.add(scene.add.rectangle(92, -34, 6, 6, hex(color)));
  return c;
}

/**
 * @param {Phaser.Scene} scene
 * @param {{wheels: string|null, engine: string|null, body: string|null}} build
 * @param {{paint: string, rim: string, headlight: string, neon: string}} looks
 * @param {{x?: number, y?: number, scale?: number, night?: boolean}} [opts]
 * @returns {Phaser.GameObjects.Container} контейнер с полями layers и wheels
 */
export function buildCar(scene, build, looks, opts = {}) {
  const car = scene.add.container(opts.x ?? 0, opts.y ?? 0);
  const wheelsPart = build.wheels ? getPart(build.wheels) : null;
  const bodyPart = build.body ? getPart(build.body) : null;
  const neon = findCosmetic('neon', looks.neon);
  const rim = findCosmetic('rim', looks.rim);

  const layers = {};
  if (neon.hex) layers.neon = drawNeon(scene, neon.hex);
  layers.wheel_back = wheelsPart ? drawWheel(scene, WHEEL_BACK_X, wheelsPart, rim.hex) : null;
  layers.wheel_front = wheelsPart ? drawWheel(scene, WHEEL_FRONT_X, wheelsPart, rim.hex) : null;
  layers.body = drawBody(scene, findCosmetic('paint', looks.paint).hex);
  layers.overlay = drawOverlay(scene, bodyPart);
  layers.headlight = drawHeadlight(
    scene,
    findCosmetic('headlight', looks.headlight).hex,
    opts.night,
  );

  // Порядок добавления = порядок отрисовки (снизу вверх).
  Object.values(layers)
    .filter(Boolean)
    .forEach((l) => car.add(l));

  car.layers = layers;
  car.wheels = [layers.wheel_back, layers.wheel_front].filter(Boolean);
  car.setScale(opts.scale ?? 1);
  return car;
}

/** Крутит колёса пропорционально пройденному пути (в пикселях). */
export function spinWheels(car, dx) {
  for (const w of car.wheels) w.rotation += dx / WHEEL_R;
}

/** «Девятка» Палыча — вишнёвый хэтчбек (ТЗ 2.1), заглушка до появления спрайта. */
export function buildRivalCar(scene, opts = {}) {
  const car = scene.add.container(opts.x ?? 0, opts.y ?? 0);
  const g = scene.add.graphics();
  g.fillStyle(0x0c0c10, 1).fillRect(-94, -42, 188, 28).fillRect(-60, -62, 110, 22);
  g.fillStyle(0x8b1a2b, 1).fillRect(-92, -40, 184, 24).fillRect(-58, -60, 106, 20);
  g.fillStyle(0x9fc4d8, 1).fillRect(-52, -56, 44, 14).fillRect(-4, -56, 46, 14);
  g.fillStyle(0x0c0c10, 1).fillCircle(-58, -12, 15).fillCircle(58, -12, 15);
  car.add(g);
  const wheels = [-58, 58].map((x) => {
    const c = scene.add.container(x, -12);
    c.add(scene.add.circle(0, 0, 12, 0x111114));
    c.add(scene.add.circle(0, 0, 6, 0x8d9096));
    c.add(scene.add.rectangle(0, 0, 2, 10, 0x000000, 0.35));
    car.add(c);
    return c;
  });
  if (opts.night) {
    const cone = scene.add.triangle(92, -30, 0, 0, 160, -26, 160, 26, 0xffe8b0, 0.16);
    cone.setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD);
    car.add(cone);
  }
  car.add(scene.add.rectangle(90, -34, 6, 6, 0xffe8b0));
  car.wheels = wheels;
  car.setScale(opts.scale ?? 1);
  return car;
}
