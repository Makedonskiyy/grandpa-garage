import Phaser from 'phaser';
import manifest from '../../data/assets.json';
import config from '../../data/config.json';
import { BaseScene } from './BaseScene.js';
import { SCENES, FONT_FAMILY } from '../config/constants.js';
import { t } from '../systems/strings.js';

/**
 * Boot (ТЗ 3.2, 7.3): «Игра загружается…», проценты, прогресс-бар по событию progress,
 * подпись команды, минимум 1,5 с, затем «Нажмите, чтобы начать» — клик разблокирует звук.
 */
export class BootScene extends BaseScene {
  constructor() {
    super(SCENES.BOOT);
  }

  preload() {
    const { width, height } = this.scale;
    this.startedAt = performance.now();

    this.label = this.add
      .text(width / 2, height / 2 - 20, t('boot.loading'), {
        fontFamily: FONT_FAMILY,
        fontSize: '10px',
      })
      .setOrigin(0.5);
    this.percent = this.add
      .text(width / 2, height / 2 + 4, '0%', {
        fontFamily: FONT_FAMILY,
        fontSize: '8px',
        color: '#a39a86',
      })
      .setOrigin(0.5);

    const barY = height - 40;
    this.add.rectangle(0, barY, width, 6, 0x24212c).setOrigin(0, 0.5);
    const bar = this.add.rectangle(0, barY, 0, 6, 0xe6b34a).setOrigin(0, 0.5);

    this.add
      .text(width / 2, height - 20, t('boot.credits'), {
        fontFamily: FONT_FAMILY,
        fontSize: '6px',
        color: '#6f6858',
      })
      .setOrigin(0.5);

    this.load.on(Phaser.Loader.Events.PROGRESS, (p) => {
      bar.width = width * p;
      this.percent.setText(`${Math.round(p * 100)}%`);
    });

    this.#queueManifest();
  }

  #queueManifest() {
    for (const a of manifest.images) this.load.image(a.key, a.path);
    for (const a of manifest.spritesheets) this.load.spritesheet(a.key, a.path, a.frame);
    for (const a of manifest.audio) this.load.audio(a.key, [].concat(a.path));
  }

  create() {
    this.enter();
    const elapsed = performance.now() - this.startedAt;
    const wait = Math.max(0, config.boot.minDurationMs - elapsed);
    this.time.delayedCall(wait, () => this.#showPressToStart());
  }

  #showPressToStart() {
    this.percent.setText('100%');
    this.label.setText(t('boot.pressToStart'));
    this.tweens.add({ targets: this.label, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 });
    const start = () => {
      this.input.off('pointerdown', start);
      this.input.keyboard?.off('keydown', start);
      // Клик — жест пользователя: браузер разрешает звук, музыка меню заиграет сразу.
      if (this.sound.locked) this.sound.unlock();
      this.goTo(SCENES.MENU);
    };
    this.input.on('pointerdown', start);
    this.input.keyboard?.on('keydown', start);
  }
}
