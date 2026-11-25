/**
 * PedalControls — экранные педали, кнопки передач и клавиатура.
 *
 * Газ: W / ↑, тормоз: S / ↓, ручник: пробел; передача вверх: E / Shift, вниз: Q / Ctrl.
 * Педали работают и мышью, и тапом; нажатие не проваливается в канвас и не листает
 * диалог. Компонент только собирает ввод: что с ним делать, решает сцена.
 */
import config from '../../data/config.json';
import { el } from './dom.js';
import { isModalOpen } from './overlay.js';
import { t } from '../systems/strings.js';
import { createPedalState, setPedalTarget, stepPedals, isPedalKey } from '../systems/pedals.js';
import { audio } from '../systems/AudioManager.js';
import { SFX } from '../config/constants.js';

/** Педали и лепестки — векторные картинки tools/build-hud.mjs. */
const HUD = 'assets/images/hud/';
const isShiftKey = (code, dir) => (config.pedals.keys[dir] ?? []).includes(code);

export class PedalControls {
  /**
   * @param {import('phaser').Scene} scene
   * @param {{ onShiftUp?: () => void, onShiftDown?: () => void, gears?: boolean }} [opts]
   */
  constructor(scene, { onShiftUp, onShiftDown, gears = true } = {}) {
    this.scene = scene;
    this.state = createPedalState();
    this.enabled = true;
    this.pointers = { gas: false, brake: false };
    this.keys = new Set();
    this.destroyed = false;
    this.onShiftUp = onShiftUp;
    this.onShiftDown = onShiftDown;

    this.$gas = this.#pedal('gas', t('race.gas'), ['W', '↑']);
    this.$brake = this.#pedal('brake', t('race.brake'), ['S', '↓']);
    this.$up = this.#shiftButton('up', t('race.shiftUp'), 'E', () => this.onShiftUp?.());
    this.$down = this.#shiftButton('down', t('race.shiftDown'), 'Q', () => this.onShiftDown?.());
    this.gears = gears;
    this.setGearsVisible(gears);

    this.#bindKeyboard();
    scene.events.once('shutdown', () => this.destroy());
  }

  #pedal(kind, label, keys) {
    const node = el(
      'button',
      {
        class: `pedal pedal--${kind}`,
        type: 'button',
        'aria-label': label,
        'aria-pressed': 'false',
        title: `${label} — ${keys.join(' / ')}`,
      },
      [
        el('img', {
          class: 'pedal__img',
          src: HUD + 'pedal_' + kind + '.svg',
          alt: '',
          draggable: 'false',
        }),
      ],
    );
    const press = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      e.stopPropagation();
      this.pointers[kind] = true;
      node.setPointerCapture?.(e.pointerId);
      this.#sync();
    };
    const release = (e) => {
      if (!this.pointers[kind]) return;
      e.preventDefault();
      e.stopPropagation();
      this.pointers[kind] = false;
      this.#sync();
    };
    node.addEventListener('pointerdown', press);
    node.addEventListener('pointerup', release);
    node.addEventListener('pointercancel', release);
    node.addEventListener('lostpointercapture', release);
    return node;
  }

  #shiftButton(dir, label, key, fire) {
    const node = el(
      'button',
      {
        class: `shift shift--${dir}`,
        type: 'button',
        'aria-label': label,
        title: `${label} — ${key}`,
      },
      [
        el('img', {
          class: 'shift__img',
          src: HUD + 'paddle_' + dir + '.svg',
          alt: '',
          draggable: 'false',
        }),
      ],
    );
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.enabled) return;
      this.#flash(node);
      fire();
    });
    return node;
  }

  #flash(node) {
    audio.playSfx(SFX.PADDLE);
    node.classList.remove('is-hit');
    void node.offsetWidth; // перезапуск анимации
    node.classList.add('is-hit');
  }

  #bindKeyboard() {
    this.onKeyDown = (e) => {
      if (isPedalKey(e.code, 'handbrake')) {
        if (!this.enabled || isModalOpen()) return;
        e.preventDefault();
        if (!e.repeat) this.keys.add(e.code);
        return;
      }
      if (isShiftKey(e.code, 'shiftUp') || isShiftKey(e.code, 'shiftDown')) {
        e.preventDefault();
        if (e.repeat || !this.enabled) return;
        const up = isShiftKey(e.code, 'shiftUp');
        this.#flash(up ? this.$up : this.$down);
        (up ? this.onShiftUp : this.onShiftDown)?.();
        return;
      }
      if (!isPedalKey(e.code, 'gas') && !isPedalKey(e.code, 'brake')) return;
      e.preventDefault();
      // Клавишу запоминаем и до старта: газ на «ёлке» раскручивает мотор.
      this.keys.add(e.code);
      if (this.enabled) this.#sync();
    };
    this.onKeyUp = (e) => {
      if (!this.keys.has(e.code)) return;
      e.preventDefault();
      this.keys.delete(e.code);
      this.#sync();
    };
    this.onBlur = () => {
      this.keys.clear();
      this.pointers.gas = false;
      this.pointers.brake = false;
      this.#sync();
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  #sync() {
    const held = (pedal) =>
      this.enabled &&
      (this.pointers[pedal] || [...this.keys].some((code) => isPedalKey(code, pedal)));
    const gas = held('gas');
    const brake = held('brake');
    // Тихий звук нажатия и отпускания педали.
    for (const [kind, on] of [
      ['gas', gas],
      ['brake', brake],
    ]) {
      if (on !== Boolean(this.down?.[kind])) audio.playSfx(on ? SFX.PEDAL_DOWN : SFX.PEDAL_UP);
    }
    this.down = { gas, brake };
    setPedalTarget(this.state, 'gas', gas);
    setPedalTarget(this.state, 'brake', brake);
    this.$gas.classList.toggle('is-pressed', gas);
    this.$brake.classList.toggle('is-pressed', brake);
    this.$gas.setAttribute('aria-pressed', String(gas));
    this.$brake.setAttribute('aria-pressed', String(brake));
  }

  /** Выключить педали на время диалога/финиша. */
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    for (const b of [this.$gas, this.$brake, this.$up, this.$down]) b.disabled = !this.enabled;
    if (!this.enabled) {
      this.keys.clear();
      this.pointers.gas = false;
      this.pointers.brake = false;
    }
    this.#sync();
    return this;
  }

  /** Показывать ли кнопки передач (в режиме «автомат» они не нужны). */
  setGearsVisible(visible) {
    this.$up.classList.toggle('is-auto', !visible);
    this.$down.classList.toggle('is-auto', !visible);
  }

  /** Сглаженные газ и тормоз вместе с состоянием ручника. */
  update(dt) {
    const { gas, brake } = stepPedals(this.state, dt);
    const handbrake =
      this.enabled &&
      config.pedals.keys.handbrake.some((code) => this.keys.has(code)) &&
      !isModalOpen();
    return { gas, brake, handbrake };
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    for (const n of [this.$gas, this.$brake, this.$up, this.$down]) n.remove();
  }
}
