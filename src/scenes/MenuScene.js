import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, FONT_FAMILY, VERSION } from '../config/constants.js';
import { el } from '../ui/dom.js';
import { button } from '../ui/components.js';
import { openSettings } from '../ui/SettingsPanel.js';
import { openHowTo } from '../ui/HowToPanel.js';
import { audio } from '../systems/AudioManager.js';
import { resetGame } from '../gameState.js';
import { t } from '../systems/strings.js';

/** Меню (ТЗ 3.3): ворота «ГАРАЖ №7», мигающая лампочка, три кнопки, версия в углу. */
export class MenuScene extends BaseScene {
  constructor() {
    super(SCENES.MENU);
  }

  create() {
    this.enter();
    audio.playMusic(MUSIC.MENU);
    this.#drawBackground();

    this.ui.append(
      el('div', { class: 'ui-abs menu' }, [
        button(t('menu.play'), () => this.#play(), { variant: 'primary' }),
        button(t('menu.howTo'), () => openHowTo()),
        button(t('menu.settings'), () => openSettings()),
      ]),
      el('div', { class: 'ui-abs version', text: t('menu.version', { version: VERSION }) }),
    );
  }

  #play() {
    resetGame();
    this.goTo(SCENES.INTRO);
  }

  /** Заглушка фона до появления арта: ворота гаража кодом. */
  #drawBackground() {
    const { width, height } = this.scale;
    const g = this.add.graphics();
    g.fillStyle(0x1b1a22).fillRect(0, 0, width, height);
    g.fillStyle(0x2a2833).fillRect(0, height - 50, width, 50);
    g.fillStyle(0x3b3f48).fillRect(150, 70, 340, 240);
    for (let y = 104; y < 300; y += 14) g.fillStyle(0x30333b).fillRect(156, y, 328, 4);
    g.fillStyle(0x0f0e13).fillRect(140, 60, 360, 10);

    this.add
      .text(width / 2, 88, 'ГАРАЖ №7', {
        fontFamily: FONT_FAMILY,
        fontSize: '10px',
        color: '#d8d0bc',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 28, t('menu.title'), {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        color: '#e6b34a',
      })
      .setOrigin(0.5);

    const lamp = this.add.circle(width / 2, 52, 4, 0xffe8b0);
    this.time.addEvent({
      delay: 3200,
      loop: true,
      callback: () =>
        this.tweens.add({ targets: lamp, alpha: 0.15, duration: 80, yoyo: true, repeat: 2 }),
    });
  }
}
