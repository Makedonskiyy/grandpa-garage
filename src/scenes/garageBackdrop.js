/**
 * Интерьер гаража — заглушка кодом до появления арта (ТЗ 6.3: «пол в клетку рисуется кодом»).
 * Используется в интро, гараже и финале.
 */
import { WORLD } from '../config/constants.js';

export const FLOOR_Y = 250;

export function drawGarageInterior(scene, { dim = 0, doorOpen = false } = {}) {
  const { width, height } = WORLD;
  const g = scene.add.graphics().setDepth(-10);

  g.fillStyle(doorOpen ? 0x6b7f99 : 0x2b2930).fillRect(0, 0, width, FLOOR_Y);
  if (!doorOpen) {
    for (let x = 0; x < width; x += 40) g.fillStyle(0x26242b).fillRect(x, 0, 2, FLOOR_Y);
  }

  // Пол в клетку.
  const tile = 20;
  for (let y = FLOOR_Y; y < height; y += tile) {
    for (let x = 0; x < width; x += tile) {
      const even = (x / tile + (y - FLOOR_Y) / tile) % 2 === 0;
      g.fillStyle(even ? 0x3a3740 : 0x312f37).fillRect(x, y, tile, tile);
    }
  }

  // Верстак, полка, лампа.
  g.fillStyle(0x5a4630).fillRect(24, 190, 120, 10);
  g.fillRect(30, 200, 8, 50).fillRect(130, 200, 8, 50);
  g.fillStyle(0x4a3b2a).fillRect(470, 90, 140, 6);
  g.fillStyle(0xffe8b0).fillCircle(width / 2, 14, 4);

  if (dim > 0) scene.add.rectangle(0, 0, width, height, 0x000000, dim).setOrigin(0).setDepth(-5);
  return { floorY: FLOOR_Y };
}
