/**
 * Комната гаража: пиксельный фон из фото (bg_garage, собирает tools/build-garage-bg.mjs) —
 * кирпичная стена, лампа дневного света под потолком, бетонный пол. Общая для тюнинга,
 * результата и финала. Машина стоит на полу перед стеной (низ стены — config.garage.wallY),
 * свет падает от лампы на неё, под машиной — её тень.
 * Мир 640×360; машина — главный яркий объект, стена к краям приглушена.
 */
import Phaser from 'phaser';
import { WORLD } from '../config/constants.js';
import config from '../../data/config.json';
import { buildCar } from '../systems/buildCar.js';
import { gameState } from '../gameState.js';

const LIGHT = 0xfff1d0; // холодно-тёплый свет люминесцентной лампы
/** Лампа на фоне: x 244…396, низ на y 33 (по фото). */
const TUBE = { x0: 244, x1: 396, y: 33 };

/** Фон гаража, приглушение к краям, свет лампы на машину и пол. */
export function drawGarageRoom(scene, { lampX, groundY }) {
  const { width, height } = WORLD;
  const wallY = config.garage.wallY;
  scene.add.image(0, 0, 'bg_garage').setOrigin(0);

  // Приглушение: по бокам темнее, под потолком чуть темнее (но не лампа) — взгляд к машине.
  const shade = scene.add.graphics();
  shade.fillStyle(0x17110e, 0.2).fillRect(0, 0, width, height);
  shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.3, 0.3, 0, 0);
  shade.fillRect(0, TUBE.y + 4, width, wallY * 0.45);
  const edge = 150;
  shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.6, 0, 0.6, 0);
  shade.fillRect(0, 0, edge, height);
  shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.6, 0, 0.6);
  shade.fillRect(width - edge, 0, edge, height);

  const light = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  // Свечение самой лампы.
  for (const [pad, a] of [
    [14, 0.05],
    [8, 0.07],
    [3, 0.1],
  ])
    light
      .fillStyle(LIGHT, a)
      .fillRect(TUBE.x0 - pad, TUBE.y - 6 - pad / 2, TUBE.x1 - TUBE.x0 + pad * 2, 6 + pad);
  // Свет от лампы вниз на машину — ступенчатые трапеции, шире к полу.
  for (const [w, a] of [
    [188, 0.02],
    [148, 0.025],
    [110, 0.03],
  ])
    light.fillStyle(LIGHT, a).fillPoints(
      [
        { x: TUBE.x0, y: TUBE.y },
        { x: TUBE.x1, y: TUBE.y },
        { x: lampX + w, y: groundY },
        { x: lampX - w, y: groundY },
      ],
      true,
    );
  // Пятно света на полу вокруг машины (тень машины лежит поверх).
  for (const [w, h, a] of [
    [420, 30, 0.05],
    [320, 20, 0.06],
    [220, 12, 0.07],
  ])
    light.fillStyle(LIGHT, a).fillEllipse(lampX, groundY + 2, w, h);
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
