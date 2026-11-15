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

const RIVAL_WHEEL_R = 12;

/** Крутит колёса машины-заглушки пропорционально пройденному пути (в пикселях). */
export function spinWheels(car, dx) {
  for (const w of car.wheels) w.rotation += dx / RIVAL_WHEEL_R;
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
    const cone = scene.add.triangle(92, -30, 0, 0, 160, -26, 160, 26, 0xffe8b0, 0.07);
    cone.setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD);
    car.add(cone);
  }
  car.add(scene.add.rectangle(90, -34, 6, 6, 0xffe8b0));
  car.wheels = wheels;
  car.setScale(opts.scale ?? 1);
  return car;
}
