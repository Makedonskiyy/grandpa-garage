import credits from '../../data/credits.json';
import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, AMB, WORLD } from '../config/constants.js';
import { audio } from '../systems/AudioManager.js';
import { resetGame } from '../gameState.js';
import { el } from '../ui/dom.js';
import { webButton } from '../ui/components.js';
import { t } from '../systems/strings.js';

const ROLL_SEC = 38;

/**
 * Финальные титры: утренний гараж в полутьме, текст медленно едет снизу вверх под финальную
 * музыку. По завершении или пропуску открываются действия после финала.
 * Текст титров — data/credits.json.
 */
export class CreditsScene extends BaseScene {
  constructor() {
    super(SCENES.CREDITS);
  }

  create() {
    this.enter();
    this.finished = false;
    audio.playMusic(MUSIC.ENDING);
    this.ambience = AMB.DAWN;
    audio.playAmbience(this.ambience);
    this.add.image(0, 0, 'bg_menu').setOrigin(0);
    this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.72).setOrigin(0);

    const roll = el(
      'div',
      { class: 'credits__roll', style: { animationDuration: `${ROLL_SEC}s` } },
      [
        el('img', { class: 'credits__logo', src: 'assets/images/ui/logo.svg', alt: credits.title }),
        el('p', { class: 'credits__subtitle', text: credits.subtitle }),
        ...credits.blocks.map((b) =>
          el('section', { class: 'credits__block' }, [
            el('h2', { class: 'credits__title', text: b.title }),
            ...b.lines.map((line) => el('p', { class: 'credits__line', text: line })),
          ]),
        ),
        el('p', { class: 'credits__end', text: credits.end }),
      ],
    );
    const skip = el('div', { class: 'ui-abs credits__skip' }, [
      webButton(t('story.skip'), () => this.#done(), { variant: 'dark' }),
    ]);
    const stage = el('div', { class: 'ui-abs credits' }, [roll]);
    const done = () => this.#done();
    roll.addEventListener('animationend', done, { once: true });
    // Таймер также открывает экран при отключённых CSS-анимациях.
    const deadline = this.time.delayedCall(ROLL_SEC * 1000 + 100, done);
    this.clearRoll = () => {
      deadline.remove(false);
      stage.remove();
      skip.remove();
      this.input.keyboard?.off('keydown-SPACE', done);
    };
    this.ui.append(stage, skip);
    this.input.keyboard?.once('keydown-SPACE', done);
    this.events.once('shutdown', this.clearRoll);
  }

  #done() {
    if (this.finished) return;
    this.finished = true;
    this.clearRoll();
    const title = el('h1', { text: credits.end });
    const message = el('p', { class: 'credits-choice__message', role: 'status' });
    const quit = webButton(t('ending.exit'), () => {
      audio.stopMusic();
      audio.playAmbience(null);
      window.close();
      message.textContent = t('ending.closeTab');
    });
    this.ui.append(
      el('section', { class: 'ui-abs credits-choice' }, [
        title,
        el('div', { class: 'credits-choice__actions' }, [
          webButton(
            t('ending.playAgain'),
            () => {
              resetGame();
              this.goTo(SCENES.INTRO);
            },
            { variant: 'primary', icon: 'restart' },
          ),
          webButton(t('ending.menu'), () => this.goTo(SCENES.MENU)),
          quit,
        ]),
        message,
      ]),
    );
  }
}
