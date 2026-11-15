import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, WORLD } from '../config/constants.js';
import { buildRivalCar } from '../systems/buildCar.js';
import { DialogSystem } from '../systems/DialogSystem.js';
import { audio } from '../systems/AudioManager.js';
import { gameState } from '../gameState.js';

/** Сцена Палыча (ТЗ 3.8): «девятка» останавливается у ворот гаража, диалог 11–14. */
export class PalychScene extends BaseScene {
  constructor() {
    super(SCENES.PALYCH);
  }

  async create() {
    this.enter();
    audio.playMusic(MUSIC.GARAGE);
    const { width, height } = WORLD;

    // Заглушка: внешний вид гаражного ряда.
    const g = this.add.graphics();
    g.fillStyle(0x8a96a6).fillRect(0, 0, width, height);
    g.fillStyle(0x4b4f58).fillRect(0, 90, width, 160);
    for (let x = 20; x < width; x += 150) g.fillStyle(0x5f646e).fillRect(x, 120, 120, 130);
    g.fillStyle(0x3b3a40).fillRect(0, 250, width, height - 250);

    const car = buildRivalCar(this, { x: width + 120, y: 290, scale: 0.8 });
    await new Promise((resolve) =>
      this.tweens.add({
        targets: car,
        x: width / 2 + 80,
        duration: 1800,
        ease: 'Cubic.easeOut',
        onComplete: resolve,
      }),
    );

    await new DialogSystem(this).play('palych');
    gameState.flags.palychMet = true;
    this.goTo(SCENES.GARAGE);
  }
}
