import Phaser from 'phaser';
import config from '../../data/config.json';
import { createLayer } from '../ui/overlay.js';
import { fitCamera } from '../systems/scale.js';

/**
 * Общая база сцен: HTML-слой интерфейса и переход с затемнением.
 * Данные между сценами передаются только через gameState (ТЗ 7.2).
 */
export class BaseScene extends Phaser.Scene {
  /** Слой HTML-интерфейса этой сцены (создаётся лениво). */
  get ui() {
    if (!this._ui || !this._ui.isConnected) this._ui = createLayer(this);
    return this._ui;
  }

  /** Вызывать в начале create(): сброс флагов и затемнение «из чёрного». */
  enter() {
    this._leaving = false;
    this._ui = null;
    this.input.enabled = true;
    fitCamera(this.cameras.main); // мир 640×360 на весь холст
    this.cameras.main.fadeIn(config.sceneFadeMs, 0, 0, 0);
  }

  /** Плавный переход в другую сцену. */
  goTo(key) {
    if (this._leaving) return;
    this._leaving = true;
    this.input.enabled = false;
    if (this._ui) this._ui.style.pointerEvents = 'none';
    this.cameras.main.fadeOut(config.sceneFadeMs, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(key);
    });
  }
}
