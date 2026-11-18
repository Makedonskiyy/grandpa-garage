import Phaser from 'phaser';
import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, VERSION, WORLD } from '../config/constants.js';
import menuConfig from '../../data/menu.json';
import { el } from '../ui/dom.js';
import { webButton } from '../ui/components.js';
import { openSettings } from '../ui/SettingsPanel.js';
import { openHowTo } from '../ui/HowToPanel.js';
import { audio } from '../systems/AudioManager.js';
import { resetGame } from '../gameState.js';
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

    this.add.image(0, 0, 'bg_menu').setOrigin(0);
    this.#createLamps();

    this.ui.append(
      el('img', {
        class: 'ui-abs menu-logo',
        src: 'assets/images/ui/logo.svg',
        alt: t('menu.title'),
        draggable: 'false',
      }),
      el('div', { class: 'ui-abs menu-actions' }, [
        webButton(t('menu.play'), () => this.#play(), {
          variant: 'primary',
          icon: 'play',
          className: 'menu-btn menu-btn--main',
        }),
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
    );
  }

  #play() {
    resetGame();
    this.goTo(SCENES.INTRO);
  }

  /** Свечение ламп фона (если заданы в data/menu.json) и мигание света (ТЗ 3.3). */
  #createLamps() {
    const { lamps, flicker } = menuConfig;
    if (!this.textures.exists('fx_glow')) this.#makeGlowTexture();

    const glows = lamps.map((l) =>
      this.add
        .image(l.x, l.y, 'fx_glow')
        .setScale(l.size)
        .setAlpha(l.alpha)
        .setBlendMode(Phaser.BlendModes.ADD),
    );

    // Мигание: короткая серия провалов света всей сцены и главной лампы, если она есть.
    const main = glows[0];
    const shade = this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0).setOrigin(0);
    const blink = () => {
      if (main) {
        this.tweens.add({
          targets: main,
          alpha: 0,
          duration: 60,
          yoyo: true,
          repeat: flicker.times - 1,
        });
      }
      this.tweens.add({
        targets: shade,
        fillAlpha: flicker.shade,
        duration: 60,
        yoyo: true,
        repeat: flicker.times - 1,
      });
      this.time.delayedCall(Phaser.Math.Between(flicker.minDelayMs, flicker.maxDelayMs), blink);
    };
    this.time.delayedCall(flicker.minDelayMs, blink);
  }

  /** Свечение ступенями, без плавного градиента — чтобы оставалось пиксельным. */
  #makeGlowTexture() {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const steps = [
      [16, 0.12],
      [12, 0.2],
      [8, 0.35],
      [4, 0.6],
    ];
    for (const [r, a] of steps) g.fillStyle(0xffc070, a).fillCircle(16, 16, r);
    g.generateTexture('fx_glow', 32, 32);
    g.destroy();
  }
}
