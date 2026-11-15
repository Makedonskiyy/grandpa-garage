import Phaser from 'phaser';
import manifest from '../../data/assets.json';
import config from '../../data/config.json';
import { BaseScene } from './BaseScene.js';
import { SCENES } from '../config/constants.js';
import { el } from '../ui/dom.js';
import { t } from '../systems/strings.js';

/**
 * Boot (ТЗ 3.2, 7.3): логотип, «Игра загружается…», проценты и полоса прогресса
 * по событию progress загрузчика Phaser, подпись команды, минимум 1,5 с.
 * Затем «Нажмите, чтобы начать»: клик разблокирует звук в браузере.
 */
export class BootScene extends BaseScene {
  constructor() {
    super(SCENES.BOOT);
  }

  preload() {
    this.startedAt = performance.now();

    this.$status = el('div', { class: 'boot__status', text: t('boot.loading') });
    this.$percent = el('div', { class: 'boot__percent', text: '0%' });
    this.$fill = el('div', { class: 'boot__fill' });
    this.ui.append(
      el('div', { class: 'ui-abs boot' }, [
        el('img', {
          class: 'boot__logo',
          src: 'assets/images/ui/logo.svg',
          alt: t('menu.title'),
          draggable: 'false',
        }),
        el('div', { class: 'boot__bar', role: 'progressbar' }, this.$fill),
        el('div', { class: 'boot__row' }, [this.$status, this.$percent]),
      ]),
      el('div', { class: 'ui-abs boot__credits', text: t('boot.credits') }),
    );

    this.load.on(Phaser.Loader.Events.PROGRESS, (p) => this.#setProgress(p));
    this.#queueManifest();
  }

  #setProgress(p) {
    const pct = Math.round(p * 100);
    this.$fill.style.transform = `scaleX(${p})`;
    this.$percent.textContent = `${pct}%`;
  }

  #queueManifest() {
    for (const a of manifest.images) this.load.image(a.key, a.path);
    for (const a of manifest.spritesheets) this.load.spritesheet(a.key, a.path, a.frame);
    for (const a of manifest.audio) this.load.audio(a.key, [].concat(a.path));
  }

  create() {
    this.enter();
    this.#setProgress(1);
    const elapsed = performance.now() - this.startedAt;
    const wait = Math.max(0, config.boot.minDurationMs - elapsed);
    this.time.delayedCall(wait, () => this.#showPressToStart());
  }

  #showPressToStart() {
    this.$status.textContent = t('boot.pressToStart');
    this.$status.classList.add('boot__status--ready');
    this.$percent.hidden = true;

    const start = () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
      // Клик — жест пользователя: браузер разрешает звук, музыка меню заиграет сразу.
      if (this.sound.locked) this.sound.unlock();
      this.goTo(SCENES.MENU);
    };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
  }
}
