import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, AMB, WORLD } from '../config/constants.js';
import { buildCar } from '../systems/buildCar.js';
import { buildMarkII } from '../systems/markII.js';
import { StoryStage } from '../systems/StoryStage.js';
import { audio } from '../systems/AudioManager.js';
import { gameState } from '../gameState.js';

const YARD = 'palych_arrival';
const GROUND = 267;
const CAR_SCALE = 0.78;

/**
 * Сцена знакомства с Палычем у ворот гаража №7.
 */
export class PalychScene extends BaseScene {
  constructor() {
    super(SCENES.PALYCH);
  }

  async create() {
    this.enter();
    audio.playMusic(MUSIC.GARAGE);
    this.ambience = AMB.COOP;
    audio.playAmbience(this.ambience);
    this.add.image(0, 0, `story_${YARD}`).setOrigin(0);

    this.player = buildCar(this, gameState.build, gameState.cosmetics, {
      x: 156,
      y: GROUND,
      scale: CAR_SCALE,
      dirty: gameState.car.dirty,
    });
    const rival = buildMarkII(this, {
      x: WORLD.width + 120,
      y: GROUND,
      scale: CAR_SCALE,
    });
    rival.scaleX = -CAR_SCALE;
    let previousX = rival.x;
    await new Promise((resolve) =>
      this.tweens.add({
        targets: rival,
        x: 470,
        duration: 2200,
        ease: 'Cubic.easeOut',
        onUpdate: () => {
          const rotation = (previousX - rival.x) / (CAR_SCALE * rival.wheelR);
          for (const wheel of rival.wheels) wheel.rotation += rotation;
          previousX = rival.x;
        },
        onComplete: resolve,
      }),
    );

    await new StoryStage(this, { sceneBackground: YARD }).play('palych');
    gameState.flags.palychMet = true;
    this.goTo(SCENES.GARAGE);
  }

  update(_time, delta) {
    this.player?.step(delta / 1000);
  }
}
