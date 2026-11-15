/**
 * Комната гаража: тёмная стена, лампа над машиной, глянцевый пол с отражением.
 * Общая для тюнинга, результата и финала — машина везде стоит в одном и том же гараже.
 * Мир 640×360; машина — главный яркий объект, всё вокруг приглушено.
 */
import Phaser from 'phaser';
import { WORLD } from '../config/constants.js';
import { buildCar } from '../systems/buildCar.js';
import { gameState } from '../gameState.js';

const WALL = [0x15130f, 0x1a1713, 0x1f1b16, 0x231f19];
const FLOOR = 0x2a2622;
const LIGHT = 0xffd9a0;

/** Стена, пол и лампа со светом на машину. */
export function drawGarageRoom(scene, { lampX, groundY }) {
  const { width, height } = WORLD;
  const g = scene.add.graphics();
  // Стена: тёмные доски, к потолку темнее (ступенями — пиксельно).
  WALL.forEach((c, i) =>
    g.fillStyle(c).fillRect(0, (groundY * i) / WALL.length, width, groundY / WALL.length + 1),
  );
  for (let x = 0; x < width; x += 32) g.fillStyle(0x000000, 0.18).fillRect(x, 0, 1, groundY);
  // Плинтус и пол.
  g.fillStyle(0x0e0c0a).fillRect(0, groundY - 2, width, 3);
  g.fillStyle(FLOOR).fillRect(0, groundY + 1, width, height - groundY);
  for (let y = groundY + 8; y < height; y += 14) {
    g.fillStyle(0x000000, 0.12).fillRect(0, y, width, 1);
  }

  // Лампа и конус света — ступенчатые слои с режимом ADD.
  g.fillStyle(0x0b0a08).fillRect(lampX - 1, 0, 2, 26);
  g.fillStyle(0x3a352e).fillRect(lampX - 10, 26, 20, 5);
  g.fillStyle(0xffe2a8).fillRect(lampX - 4, 31, 8, 3);
  const light = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  for (const [w, a] of [
    [200, 0.035],
    [160, 0.04],
    [120, 0.05],
  ]) {
    light
      .fillStyle(LIGHT, a)
      .fillTriangle(lampX - 10, 32, lampX + 10, 32, lampX + w, groundY)
      .fillTriangle(lampX - 10, 32, lampX - w, groundY, lampX + w, groundY);
  }
  for (const [w, h, a] of [
    [320, 22, 0.06],
    [240, 16, 0.07],
    [150, 10, 0.08],
  ]) {
    light.fillStyle(LIGHT, a).fillEllipse(lampX, groundY + 4, w, h);
  }
}

/**
 * Машина игрока в гараже: отражение на полу, пол гасит его книзу, сверху сама машина.
 * @returns {{ car: import('../systems/CarRig.js').CarRig, reflection: import('../systems/CarRig.js').CarRig }}
 */
export function placeGarageCar(scene, { x, groundY, scale = 1, reflectionAlpha = 0.16 }) {
  const opts = { x, y: groundY, dirty: gameState.car.dirty, scale };
  const reflection = buildCar(scene, gameState.build, gameState.cosmetics, opts)
    .setScale(scale, -scale)
    .setAlpha(reflectionAlpha);
  const { width, height } = WORLD;
  const fade = scene.add.graphics();
  fade.fillGradientStyle(FLOOR, FLOOR, FLOOR, FLOOR, 0, 0, 1, 1);
  fade.fillRect(0, groundY + 1, width, height - groundY);
  const car = buildCar(scene, gameState.build, gameState.cosmetics, opts);
  return { car, reflection };
}
