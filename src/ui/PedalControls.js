/**
 * PedalControls — две экранные педали и клавиатура.
 *
 * Газ: W / ↑, тормоз: S / ↓. Педали работают и мышью, и тапом; нажатие не проваливается
 * в канвас и не листает диалог. Компонент только собирает input: решение, как его
 * показывать, остаётся за сценой.
 */
import { el } from './dom.js';
import { t } from '../systems/strings.js';
import { createPedalState, setPedalTarget, stepPedals, isPedalKey } from '../systems/pedals.js';

export class PedalControls {
  /**
   * @param {import('phaser').Scene} scene
   * @param {{compact?: boolean, className?: string}} [opts]
   */
  constructor(scene, { compact = false, className = '' } = {}) {
    this.scene = scene;
    this.state = createPedalState();
    this.enabled = true;
    this.pointers = { gas: false, brake: false };
    this.keys = new Set();
    this.destroyed = false;

    this.$gas = this.#makeButton('gas', t('race.gas'), 'W', '↑');
    this.$brake = this.#makeButton('brake', t('race.brake'), 'S', '↓');
    this.node = el(
      'div',
      {
        class: ['pedals', compact && 'pedals--compact', className].filter(Boolean).join(' '),
        'aria-label': t('race.pedalHint'),
      },
      [this.$brake, this.$gas],
    );

    this.#bindKeyboard();
    scene.events.once('shutdown', () => this.destroy());
  }

  #makeButton(kind, label, key, alt) {
    const node = el(
      'button',
      {
        class: `pedal pedal--${kind}`,
        type: 'button',
        'aria-label': label,
        'aria-pressed': 'false',
        title: `${label} — ${key} / ${alt}`,
      },
      [
        el('span', { class: 'pedal__label', text: label }),
        el('span', { class: 'pedal__keys' }, [el('kbd', { text: key }), el('kbd', { text: alt })]),
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

  #bindKeyboard() {
    this.onKeyDown = (e) => {
      if (!isPedalKey(e.code, 'gas') && !isPedalKey(e.code, 'brake')) return;
      e.preventDefault();
      // Клавишу запоминаем и до старта: если игрок держит газ на «ёлке»,
      // после зелёного педаль сразу сработает.
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
    const gas =
      this.enabled && (this.pointers.gas || [...this.keys].some((code) => isPedalKey(code, 'gas')));
    const brake =
      this.enabled &&
      (this.pointers.brake || [...this.keys].some((code) => isPedalKey(code, 'brake')));

    setPedalTarget(this.state, 'gas', gas);
    setPedalTarget(this.state, 'brake', brake);
    this.$gas.classList.toggle('is-down', gas);
    this.$brake.classList.toggle('is-down', brake);
    this.$gas.setAttribute('aria-pressed', String(gas));
    this.$brake.setAttribute('aria-pressed', String(brake));
  }

  /** Выключить педали на время диалога/финиша. */
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.$gas.disabled = !this.enabled;
    this.$brake.disabled = !this.enabled;
    if (!this.enabled) {
      this.keys.clear();
      this.pointers.gas = false;
      this.pointers.brake = false;
    }
    this.#sync();
    return this;
  }

  /** Текущие сглаженные значения: { gas, brake } от 0 до 1. */
  update(dt) {
    return stepPedals(this.state, dt);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.node.remove();
  }
}
