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
 * музыку. Пробел, клик или «Пропустить» — сразу в меню; в конце — «Конец» и меню.
 * Текст титров — data/credits.json.
 */
export class CreditsScene extends BaseScene {
  constructor() {
    super(SCENES.CREDITS);
  }

  create() {
    this.enter();
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
    roll.addEventListener('animationend', () => this.#done());
    this.ui.append(
      el('div', { class: 'ui-abs credits' }, [roll]),
      el('div', { class: 'ui-abs credits__skip' }, [
        webButton(t('story.skip'), () => this.#done(), { variant: 'dark' }),
      ]),
    );
    this.input.keyboard?.once('keydown-SPACE', () => this.#done());
  }

  #done() {
    resetGame();
    this.goTo(SCENES.MENU);
  }
}
