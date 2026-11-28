/**
 * buildCar — единая точка сборки машины игрока для всех сцен (ТЗ 5.2).
 * Сама машина — CarRig (пиксельные слои из tools/build-car.mjs + физика показа).
 *
 * Машину Палыча временно представляет чёрный прямоугольник в габаритах машины игрока.
 */
import { CarRig } from './CarRig.js';
import carArt from '../../data/car.json';

/**
 * @param {Phaser.Scene} scene
 * @param {object} build сборка из gameState
 * @param {object} looks косметика из gameState
 * @param {{ x?: number, y?: number, scale?: number, night?: boolean, driver?: boolean, dirty?: boolean | 'dust' }} [opts]
 * @returns {CarRig}
 */
export function buildCar(scene, build, looks, opts = {}) {
  return new CarRig(scene, opts.x ?? 0, opts.y ?? 0, {
    build,
    looks,
    dirty: opts.dirty,
    night: opts.night,
    driver: opts.driver,
    scale: opts.scale,
  });
}

/** Временная заглушка. Точка (0, 0) — земля под серединой машины. */
export function buildRivalCar(scene, opts = {}) {
  return scene.add
    .rectangle(opts.x ?? 0, opts.y ?? 0, carArt.size.width, carArt.anchor.y, 0x050505)
    .setOrigin(0.5, 1)
    .setScale(opts.scale ?? 1);
}
