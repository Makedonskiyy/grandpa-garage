import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, AMB, WORLD } from '../config/constants.js';
import { buildCar } from '../systems/buildCar.js';
import { buildMarkII, MARK2 } from '../systems/markII.js';
import { StoryStage } from '../systems/StoryStage.js';
import { audio } from '../systems/AudioManager.js';
import { gameState } from '../gameState.js';

const YARD = 'palych_arrival';
const GROUND = 278;
const SKYLINE_SCALE = 1.53;
// Замер от бампера до бампера у непрозрачной части car_base, без полей текстуры.
const SKYLINE_VISIBLE_LENGTH = 273.33;
const SKYLINE_FRONT = 136;
const WORLD_PER_MM = (SKYLINE_VISIBLE_LENGTH * SKYLINE_SCALE) / 4600;
const MARK2_SCALE = (MARK2.lengthMm * WORLD_PER_MM) / MARK2.visibleLength;
const MARK2_HALF_WIDTH = (MARK2.visibleLength * MARK2_SCALE) / 2;
const CENTER_X = WORLD.width / 2;
const BUMPER_GAP = 48;

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
      x: CENTER_X - BUMPER_GAP / 2 - SKYLINE_FRONT * SKYLINE_SCALE,
      y: GROUND,
      scale: SKYLINE_SCALE,
      dirty: gameState.car.dirty,
    });
    const rival = buildMarkII(this, {
      x: WORLD.width + MARK2_HALF_WIDTH + 8,
      y: GROUND,
      scale: MARK2_SCALE,
    });
    rival.scaleX = -MARK2_SCALE;
    let previousX = rival.x;
    await new Promise((resolve) =>
      this.tweens.add({
        targets: rival,
        x: CENTER_X + BUMPER_GAP / 2 + MARK2_HALF_WIDTH,
        duration: 2200,
        ease: 'Cubic.easeOut',
        onUpdate: () => {
          const rotation = (previousX - rival.x) / (MARK2_SCALE * rival.wheelR);
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
