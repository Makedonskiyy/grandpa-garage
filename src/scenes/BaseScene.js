import Phaser from 'phaser';
import config from '../../data/config.json';
import { createLayer, closeAllModals } from '../ui/overlay.js';
import { closeShutter, openShutter, isShutterClosed } from '../ui/transition.js';
import { fitCamera, getRenderZoom } from '../systems/scale.js';
import { WORLD } from '../config/constants.js';

/**
 * Общая база сцен: HTML-слой интерфейса и переход между сценами.
 * Переход — гаражная рольставня (ui/transition.js): опускается, сцена меняется под ней,
 * ставня поднимается, а камера новой сцены мягко «отъезжает» на место.
 * Данные между сценами передаются только через gameState (ТЗ 7.2).
 */
export class BaseScene extends Phaser.Scene {
  /** Слой HTML-интерфейса этой сцены (создаётся лениво). */
  get ui() {
    if (!this._ui || !this._ui.isConnected) this._ui = createLayer(this);
    return this._ui;
  }

  /** Вызывать в начале create(): сброс флагов и появление сцены. */
  enter() {
    closeAllModals();
    this._leaving = false;
    this._ui = null;
    this.input.enabled = true;
    const cam = this.cameras.main;
    fitCamera(cam); // мир 640×360 на весь холст
    if (isShutterClosed()) {
      // Сцена появляется из-под ставни с лёгким отъездом камеры.
      const zoom = getRenderZoom();
      cam
        .setOrigin(0.5)
        .setZoom(zoom * 1.04)
        .centerOn(WORLD.width / 2, WORLD.height / 2);
      this.tweens.add({
        targets: cam,
        zoom,
        duration: 900,
        ease: 'Sine.easeOut',
        onComplete: () => fitCamera(cam),
      });
      // Кадр на отрисовку сцены, затем ставня вверх.
      this.time.delayedCall(60, openShutter);
    } else {
      cam.fadeIn(config.sceneFadeMs, 0, 0, 0);
    }
  }

  /** Плавный переход в другую сцену. */
  goTo(key) {
    if (this._leaving) return;
    this._leaving = true;
    this.input.enabled = false;
    if (this._ui) this._ui.style.pointerEvents = 'none';
    // Камера чуть наезжает, пока ставня опускается.
    const cam = this.cameras.main;
    const zoom = cam.zoom;
    cam.setOrigin(0.5).centerOn(WORLD.width / 2, WORLD.height / 2);
    this.tweens.add({ targets: cam, zoom: zoom * 1.03, duration: 420, ease: 'Sine.easeIn' });
    closeShutter().then(() => this.scene.start(key));
  }
}
