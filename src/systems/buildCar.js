/**
 * buildCar — единая точка сборки машины игрока для всех сцен (ТЗ 5.2).
 * Сама машина — CarRig (пиксельные слои из tools/build-car.mjs + физика показа).
 *
 * Машина Палыча — Toyota Mark II (systems/markII.js), временно нарисованная кодом:
 * её заменит такой же генератор по чертежу, как у машины игрока.
 */
import { CarRig } from './CarRig.js';
import { buildMarkII } from './markII.js';

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

/** Радиус колеса по умолчанию, если машина его не задала. */
const RIVAL_WHEEL_R = 13;

/** Крутит колёса машины Палыча пропорционально пройденному пути (в пикселях). */
export function spinWheels(car, dx) {
  for (const w of car.wheels) w.rotation += dx / (car.wheelR ?? RIVAL_WHEEL_R);
}

/** Машина Палыча — Toyota Mark II (systems/markII.js). Точка (0, 0) — земля под серединой. */
export function buildRivalCar(scene, opts = {}) {
  return buildMarkII(scene, opts);
}
