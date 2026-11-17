import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC } from '../config/constants.js';
import { StoryStage } from '../systems/StoryStage.js';
import { audio } from '../systems/AudioManager.js';
import { webButton } from '../ui/components.js';
import { gameState } from '../gameState.js';
import { t } from '../systems/strings.js';

/**
 * Интро (ТЗ 3.5) как сцена истории: дата на чёрном, гараж с машиной под чехлом,
 * верстак с запиской — дед на старой фотографии, его голос — почерк. «Пропустить» в углу.
 * Фоны и кто на экране — в data/story.json.
 */
export class IntroScene extends BaseScene {
  constructor() {
    super(SCENES.INTRO);
  }

  async create() {
    this.enter();
    audio.playMusic(MUSIC.INTRO);
    this.cameras.main.setBackgroundColor('#000000');

    const stage = new StoryStage(this);
    stage.addControl(webButton(t('dialog.skip'), () => this.#finish()));
    await stage.play('intro');
    this.#finish();
  }

  #finish() {
    gameState.flags.introSeen = true;
    this.goTo(SCENES.GARAGE);
  }
}
