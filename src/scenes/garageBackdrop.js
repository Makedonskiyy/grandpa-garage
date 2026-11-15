/**
 * Комната гаража: пиксельный фон из фото гаража (bg_garage), лампа над машиной, тёплый свет
 * на неё. Общая для тюнинга, результата и финала — машина везде стоит в одном и том же гараже.
 * Мир 640×360; машина — главный яркий объект, стена к краям приглушена.
 */
import Phaser from 'phaser';
import { WORLD } from '../config/constants.js';
import { buildCar } from '../systems/buildCar.js';
import { gameState } from '../gameState.js';

const LIGHT = 0xffd9a0;

/** Фон гаража, приглушение к краям, лампа и конус света на машину. */
export function drawGarageRoom(scene, { lampX, groundY }) {
  const { width, height } = WORLD;
  scene.add.image(0, 0, 'bg_garage').setOrigin(0);

  // Приглушение: сверху и по бокам темнее — взгляд идёт к машине под лампой.
  const shade = scene.add.graphics();
  shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.55, 0.55, 0, 0);
  shade.fillRect(0, 0, width, groundY * 0.7);
  const edge = 140;
  shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.6, 0, 0.6, 0);
  shade.fillRect(0, 0, edge, height);
  shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.6, 0, 0.6);
  shade.fillRect(width - edge, 0, edge, height);

  // Лампа на проводе и конус света — ступенчатые слои с режимом ADD.
  const g = scene.add.graphics();
  g.fillStyle(0x0b0a08).fillRect(lampX - 1, 0, 2, 26);
  g.fillStyle(0x3a352e).fillRect(lampX - 10, 26, 20, 5);
  g.fillStyle(0xffe2a8).fillRect(lampX - 4, 31, 8, 3);
  const light = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  for (const [w, a] of [
    [190, 0.03],
    [150, 0.035],
    [110, 0.04],
  ]) {
    light
      .fillStyle(LIGHT, a)
      .fillTriangle(lampX - 10, 32, lampX + 10, 32, lampX + w, groundY)
      .fillTriangle(lampX - 10, 32, lampX - w, groundY, lampX + w, groundY);
  }
  for (const [w, h, a] of [
    [340, 26, 0.06],
    [250, 18, 0.07],
    [160, 10, 0.08],
  ]) {
    light.fillStyle(LIGHT, a).fillEllipse(lampX, groundY + 4, w, h);
  }
}

/**
 * Машина игрока в гараже. Пол бетонный и матовый — без отражения, только тень машины.
 * @returns {{ car: import('../systems/CarRig.js').CarRig, reflection: null }}
 */
export function placeGarageCar(scene, { x, groundY, scale = 1 }) {
  const car = buildCar(scene, gameState.build, gameState.cosmetics, {
    x,
    y: groundY,
    dirty: gameState.car.dirty,
    scale,
  });
  return { car, reflection: null };
}
