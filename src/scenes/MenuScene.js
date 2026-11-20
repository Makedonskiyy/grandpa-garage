import Phaser from 'phaser';
import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, VERSION, AMB } from '../config/constants.js';

const REPO_URL = 'https://github.com/Makedonskiyy/grandpa-garage';
import { el } from '../ui/dom.js';
import { webButton } from '../ui/components.js';
import { openSettings } from '../ui/SettingsPanel.js';
import { openHowTo } from '../ui/HowToPanel.js';
import { audio } from '../systems/AudioManager.js';
import { resetGame, continueGame, gameState } from '../gameState.js';
import { hasSave } from '../systems/save.js';
import { icon } from '../ui/icons.js';
import { t } from '../systems/strings.js';

/**
 * Меню (ТЗ 3.3): пиксельный фон гаража — машина под чехлом в свете лампы, логотип слева вверху,
 * под ним внизу слева столбик кнопок той же ширины, что и логотип (сетка 8 px):
 * главная «Начать игру» в цвет ушанки, остальные — тёмные. Лампа изредка мигает.
 */
export class MenuScene extends BaseScene {
  constructor() {
    super(SCENES.MENU);
  }

  create() {
    this.enter();
    audio.playMusic(MUSIC.MENU);
    this.ambience = AMB.COOP;
    audio.playAmbience(this.ambience);

    this.add.image(0, 0, 'bg_menu').setOrigin(0);
    this.#createWind();

    this.ui.append(
      el('div', { class: 'ui-abs menu-shade' }),
      el('img', {
        class: 'ui-abs menu-logo',
        src: 'assets/images/ui/logo.svg',
        alt: t('menu.title'),
        draggable: 'false',
      }),
      el('div', { class: 'ui-abs menu-actions' }, [
        ...(hasSave()
          ? [
              webButton(t('menu.continue'), () => this.#continue(), {
                variant: 'primary',
                icon: 'play',
                className: 'menu-btn menu-btn--main',
              }),
              webButton(t('menu.newGame'), () => this.#play(), {
                variant: 'dark',
                icon: 'restart',
                className: 'menu-btn',
              }),
            ]
          : [
              webButton(t('menu.play'), () => this.#play(), {
                variant: 'primary',
                icon: 'play',
                className: 'menu-btn menu-btn--main',
              }),
            ]),
        webButton(t('menu.howTo'), () => openHowTo(), {
          variant: 'dark',
          icon: 'help',
          className: 'menu-btn',
        }),
        webButton(t('menu.settings'), () => openSettings(), {
          variant: 'dark',
          icon: 'gear',
          className: 'menu-btn',
        }),
      ]),
      el('div', { class: 'ui-abs version', text: t('menu.version', { version: VERSION }) }),
      // Ссылка на код игры: иконка в правом верхнем углу, открывается в новой вкладке.
      el(
        'a',
        {
          class: 'ui-abs wbtn wbtn--dark wbtn--icon menu-github',
          href: REPO_URL,
          target: '_blank',
          rel: 'noopener',
          title: t('menu.github'),
          'aria-label': t('menu.github'),
        },
        [icon('github')],
      ),
    );
  }

  #play() {
    resetGame();
    this.goTo(SCENES.INTRO);
  }

  /** Продолжить с сохранения: в гараж, к текущему заезду (интро уже было). */
  #continue() {
    if (!continueGame()) return this.#play();
    this.goTo(gameState.flags.introSeen ? SCENES.GARAGE : SCENES.INTRO);
  }

  /**
   * Ветер: порывами (раз в несколько секунд) с деревьев слева и справа срывает листья,
   * они летят вправо и падают на дорогу. Пиксельные квадратики 2×2 трёх оттенков.
   */
  #createWind() {
    if (!this.textures.exists('leaf_px')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff).fillRect(0, 0, 2, 2);
      g.generateTexture('leaf_px', 2, 2);
      g.destroy();
    }
    const leaves = (x, y, w) =>
      this.add.particles(0, 0, 'leaf_px', {
        x: { min: x, max: x + w },
        y: { min: y, max: y + 50 },
        speedX: { min: 20, max: 55 },
        speedY: { min: -6, max: 14 },
        accelerationY: 9,
        rotate: { min: 0, max: 360 },
        lifespan: 9000,
        frequency: 420,
        tint: [0x6f8a3a, 0x9aa548, 0xc9a24a, 0x4f6a2c],
        alpha: { start: 1, end: 0.6 },
      });
    const sides = [leaves(10, 20, 260), leaves(470, 20, 160)];
    // Порыв: листьев больше и летят быстрее, потом стихает — цикл.
    const gust = () => {
      for (const e of sides) {
        e.frequency = 60;
        e.speedX = { min: 60, max: 120 };
      }
      this.time.delayedCall(1600, () => {
        for (const e of sides) {
          e.frequency = 420;
          e.speedX = { min: 20, max: 55 };
        }
      });
      this.time.delayedCall(Phaser.Math.Between(5000, 8000), gust);
    };
    this.time.delayedCall(2500, gust);
  }
}
