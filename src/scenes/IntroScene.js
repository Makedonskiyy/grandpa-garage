import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC } from '../config/constants.js';
import { DialogSystem } from '../systems/DialogSystem.js';
import { audio } from '../systems/AudioManager.js';
import { webButton } from '../ui/components.js';
import { gameState } from '../gameState.js';
import { t } from '../systems/strings.js';

/**
 * Интро (ТЗ 3.5): дата на чёрном, затем тот же гараж, что в меню, но темнее,
 * записка деда листком (реплики 4–7) и реплики внука. «Пропустить» в углу.
 */
export class IntroScene extends BaseScene {
  constructor() {
    super(SCENES.INTRO);
  }

  async create() {
    this.enter();
    audio.playMusic(MUSIC.INTRO);

    const { width, height } = this.scale;
    this.add.image(0, 0, 'bg_menu').setOrigin(0);
    this.add.rectangle(0, 0, width, height, 0x000000, 0.5).setOrigin(0);

    this.ui.append(
      webButton(t('dialog.skip'), () => this.#finish(), { className: 'ui-abs skip wbtn--small' }),
    );

    this.dialog = new DialogSystem(this);
    await this.dialog.play('intro');
    this.#finish();
  }

  #finish() {
    gameState.flags.introSeen = true;
    this.goTo(SCENES.GARAGE);
  }
}
