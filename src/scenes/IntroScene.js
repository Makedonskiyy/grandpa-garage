import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC } from '../config/constants.js';
import { DialogSystem } from '../systems/DialogSystem.js';
import { audio } from '../systems/AudioManager.js';
import { button } from '../ui/components.js';
import { gameState } from '../gameState.js';
import { t } from '../systems/strings.js';
import { drawGarageInterior } from './garageBackdrop.js';

/** Интро (ТЗ 3.5): дата на чёрном, затем гараж с затемнением и реплики 1–8; «Пропустить» в углу. */
export class IntroScene extends BaseScene {
  constructor() {
    super(SCENES.INTRO);
  }

  async create() {
    this.enter();
    audio.playMusic(MUSIC.INTRO);
    drawGarageInterior(this, { dim: 0.55 });

    this.ui.append(button(t('dialog.skip'), () => this.#finish(), { className: 'ui-abs skip' }));

    this.dialog = new DialogSystem(this);
    await this.dialog.play('intro');
    this.#finish();
  }

  #finish() {
    gameState.flags.introSeen = true;
    this.goTo(SCENES.GARAGE);
  }
}
