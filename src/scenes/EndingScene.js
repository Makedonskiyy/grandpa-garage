import partsData from '../../data/parts.json';
import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC } from '../config/constants.js';
import { drawGarageInterior, FLOOR_Y } from './garageBackdrop.js';
import { buildCar } from '../systems/buildCar.js';
import { DialogSystem } from '../systems/DialogSystem.js';
import { audio } from '../systems/AudioManager.js';
import { formatSeconds, getPart } from '../systems/simulate.js';
import { gameState, resetGame } from '../gameState.js';
import { el } from '../ui/dom.js';
import { button } from '../ui/components.js';
import { t } from '../systems/strings.js';

/** Финал (ТЗ 3.11): реплики 16–19, ворота распахнуты, итоги, «Играть снова». */
export class EndingScene extends BaseScene {
  constructor() {
    super(SCENES.ENDING);
  }

  async create() {
    this.enter();
    audio.playMusic(MUSIC.ENDING);
    drawGarageInterior(this, { doorOpen: true });
    buildCar(this, gameState.build, gameState.cosmetics, {
      x: 320,
      y: FLOOR_Y - 6,
      dirty: gameState.car.dirty,
    });

    await new DialogSystem(this).play('ending');

    const win = gameState.winningResult;
    const parts = partsData.slots
      .map((s) => getPart(gameState.build[s.id])?.name)
      .filter(Boolean)
      .join(', ');

    this.ui.append(
      el('div', { class: 'ui-abs panel result' }, [
        el('h1', { class: 'accent', text: t('menu.title') }),
        el('p', { text: t('ending.attempts', gameState.attempts) }),
        win?.details?.time
          ? el('p', { text: t('ending.raceTime', { time: formatSeconds(win.details.time) }) })
          : null,
        el('p', { text: t('ending.winningParts', { parts }) }),
        el(
          'div',
          { class: 'result__actions' },
          button(
            t('ending.playAgain'),
            () => {
              resetGame();
              this.goTo(SCENES.MENU);
            },
            { variant: 'primary' },
          ),
        ),
      ]),
    );
  }
}
