import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, WORLD } from '../config/constants.js';
import { buildCar, buildRivalCar, spinWheels } from '../systems/buildCar.js';
import { StoryStage } from '../systems/StoryStage.js';
import { audio } from '../systems/AudioManager.js';
import { gameState } from '../gameState.js';

// Земля выше диалогового окна: машины не прячутся за репликами.
const GROUND = 226;

/**
 * Сцена Палыча (ТЗ 3.8): у ворот гаража №7 стоит японка, подъезжает вишнёвая «девятка»
 * Палыча, диалог 11–14. Фон — ряд гаражей кооператива «Заря» в ноябре.
 */
export class PalychScene extends BaseScene {
  constructor() {
    super(SCENES.PALYCH);
  }

  async create() {
    this.enter();
    audio.playMusic(MUSIC.GARAGE);
    this.#drawRow();

    this.player = buildCar(this, gameState.build, gameState.cosmetics, {
      x: 196,
      y: GROUND,
      scale: 0.9,
      dirty: gameState.car.dirty,
    });
    const rival = buildRivalCar(this, { x: WORLD.width + 120, y: GROUND, scale: 1 });
    let prevX = rival.x;
    await new Promise((resolve) =>
      this.tweens.add({
        targets: rival,
        x: 486,
        duration: 1800,
        ease: 'Cubic.easeOut',
        onUpdate: () => {
          spinWheels(rival, rival.x - prevX);
          prevX = rival.x;
        },
        onComplete: resolve,
      }),
    );

    await new StoryStage(this).play('palych');
    gameState.flags.palychMet = true;
    this.goTo(SCENES.GARAGE);
  }

  update(_time, delta) {
    this.player?.step(delta / 1000);
  }

  /** Пасмурное небо, ряд кирпичных гаражей с крашеными воротами, снег, раскисшая земля. */
  #drawRow() {
    const { width, height } = WORLD;
    const g = this.add.graphics();
    [0xaeb7c1, 0xb7bfc8, 0xc0c7ce].forEach((c, i) => g.fillStyle(c).fillRect(0, i * 20, width, 21));
    const gates = [0x4f5d52, 0x5b5f66, 0x6b5a48, 0x4b5866];
    for (let x = -40, i = 0; x < width; x += 140, i++) {
      g.fillStyle(0x7a6f66).fillRect(x, 60, 140, GROUND - 60);
      for (let by = 64; by < GROUND; by += 6) g.fillStyle(0x6e645c).fillRect(x, by, 140, 1);
      g.fillStyle(0x5d544d).fillRect(x, 60, 3, GROUND - 60);
      g.fillStyle(gates[i % gates.length]).fillRect(x + 22, 96, 96, GROUND - 96);
      g.fillStyle(0x000000, 0.22).fillRect(x + 69, 96, 2, GROUND - 96);
      g.fillStyle(0xffffff, 0.08).fillRect(x + 22, 96, 96, 2);
      // Номер мелом на воротах.
      g.fillStyle(0xe8e3d6).fillRect(x + 30, 104, 10, 6);
      // Крыша со снегом.
      g.fillStyle(0x3d3833).fillRect(x - 4, 54, 148, 8);
      g.fillStyle(0xeef1f3).fillRect(x - 4, 50, 148, 6);
    }
    // Земля: снег у стены, грязь, колея.
    g.fillStyle(0xdfe4e7).fillRect(0, GROUND, width, 4);
    [0x5f4a35, 0x584430, 0x513e2b].forEach((c, i) =>
      g.fillStyle(c).fillRect(0, GROUND + 4 + i * 44, width, 45),
    );
    for (let x = 0; x < width; x += 6) g.fillStyle(0x3b2d1f).fillRect(x, GROUND + 22, 4, 2);
    g.fillStyle(0x000000, 0.2).fillRect(0, height - 20, width, 20);
  }
}
