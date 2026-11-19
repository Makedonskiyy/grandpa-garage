import partsData from '../../data/parts.json';
import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, AMB } from '../config/constants.js';
import { drawGarageRoom, placeGarageCar } from './garageBackdrop.js';
import { StoryStage } from '../systems/StoryStage.js';
import { audio } from '../systems/AudioManager.js';
import { formatSeconds, getPart } from '../systems/simulate.js';
import { gameState, resetGame } from '../gameState.js';
import { el } from '../ui/dom.js';
import { webButton } from '../ui/components.js';
import { t } from '../systems/strings.js';

// Победившая машина в центре под лампой — как в гараже, только крупнее итогов.
const STAGE = { carX: 320, groundY: 248, scale: 1.3 };

/** Финал (ТЗ 3.11): реплики 16–19, машина в гараже, итоги, «Играть снова». */
export class EndingScene extends BaseScene {
  constructor() {
    super(SCENES.ENDING);
  }

  async create() {
    this.enter();
    audio.playMusic(MUSIC.ENDING);
    this.ambience = AMB.DAWN;
    audio.playAmbience(this.ambience);
    drawGarageRoom(this, { lampX: STAGE.carX, groundY: STAGE.groundY });
    ({ car: this.car } = placeGarageCar(this, {
      x: STAGE.carX,
      groundY: STAGE.groundY,
      scale: STAGE.scale,
    }));

    await new StoryStage(this).play('ending');

    const win = gameState.winningResult;
    const parts = partsData.slots
      .map((s) => getPart(gameState.build[s.id])?.name)
      .filter(Boolean)
      .join(', ');
    const stat = (label, value) =>
      el('div', {}, [
        el('div', { class: 'ending-stat__label', text: label }),
        el('div', { class: 'ending-stat__value', text: value }),
      ]);

    this.ui.append(
      el('section', { class: 'ui-abs surface ending-panel' }, [
        el('h1', { class: 'ending-panel__title', text: t('ending.title') }),
        stat(t('ending.attemptsLabel'), t('ending.attemptsValue', gameState.attempts)),
        stat(
          t('ending.timeLabel'),
          win?.details?.time ? `${formatSeconds(win.details.time)} ${t('garage.units.sec')}` : '—',
        ),
        stat(t('ending.partsLabel'), parts),
        el('div', { class: 'ending-panel__actions' }, [
          webButton(t('ending.credits'), () => this.goTo(SCENES.CREDITS), {
            variant: 'primary',
            icon: 'play',
          }),
          webButton(t('ending.playAgain'), () => {
            resetGame();
            this.goTo(SCENES.MENU);
          }),
        ]),
      ]),
    );
  }

  update(_time, delta) {
    if (!this.car) return;
    this.car.step(delta / 1000);
  }
}
