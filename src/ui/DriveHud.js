/**
 * DriveHud — приборы и управление в обкатке и заезде: педали с передачами, тахометр
 * с зелёной зоной, скорость и строка подсказки. Подсказка показывает одно, самое важное
 * сейчас, и держится не меньше секунды, чтобы её успели прочитать.
 */
import { el } from './dom.js';
import { icon } from './icons.js';
import { t } from '../systems/strings.js';
import { PedalControls } from './PedalControls.js';
import { createTacho } from './tacho.js';
import { greenZone, shiftUp, shiftDown } from '../systems/drive.js';

const HOLD_MS = 1100;

export class DriveHud {
  /**
   * @param {import('phaser').Scene} scene
   * @param {ReturnType<import('../systems/drive.js').createRun>} run
   * @param {{ className?: string, middle?: Node[] }} [opts] middle — блоки сцены между педалями и приборами
   */
  constructor(scene, run, { className = '', middle = [] } = {}) {
    this.run = run;
    this.pedals = new PedalControls(scene, {
      gears: !run.auto,
      onShiftUp: () => shiftUp(this.run),
      onShiftDown: () => {
        if (!shiftDown(this.run)) this.say('overrev', 'warn');
      },
    });
    this.tacho = createTacho();
    this.$speed = el('span', { class: 'speedo__value', text: '0' });
    this.$hintText = el('span', { class: 'drive-hint__text' });
    this.$hint = el('div', { class: 'ui-abs drive-hint', role: 'status', hidden: true }, [
      icon('info'),
      this.$hintText,
    ]);
    this.node = el('div', { class: `ui-abs drive-hud ${className}`.trim() }, [
      this.pedals.node,
      ...middle,
      el('div', { class: 'drive-hud__gauges' }, [
        this.tacho.node,
        el('div', { class: 'speedo' }, [
          el('span', { class: 'speedo__label', text: t('trial.speed') }),
          el('span', { class: 'speedo__readout' }, [
            this.$speed,
            el('span', { class: 'speedo__unit', text: t('race.kmh') }),
          ]),
        ]),
      ]),
    ]);
    this.hintKey = null;
    this.hintUntil = 0;
    scene.ui.append(this.node, this.$hint);
    this.render();
  }

  /** Ввод педалей за кадр. */
  input(dt) {
    return this.pedals.update(dt);
  }

  setEnabled(on) {
    this.pedals.setEnabled(on);
  }

  setVisible(on) {
    this.node.style.visibility = on ? '' : 'hidden';
    if (!on) this.$hint.hidden = true;
  }

  /** Показать подсказку: tone — info | warn | good. Срочная (warn) перебивает обычную. */
  say(key, tone = 'info', now = performance.now()) {
    if (!key) return;
    const busy = now < this.hintUntil && this.hintKey !== key;
    if (busy && tone !== 'warn' && this.hintTone === 'warn') return;
    if (busy && tone === 'info' && this.hintTone !== 'info') return;
    this.hintKey = key;
    this.hintTone = tone;
    this.hintUntil = now + HOLD_MS;
    this.$hintText.textContent = t(`drive.hints.${key}`);
    this.$hint.dataset.tone = tone;
    this.$hint.hidden = false;
  }

  /** Спрятать подсказку, когда её время вышло и сказать нечего. */
  quiet(now = performance.now()) {
    if (now >= this.hintUntil) this.$hint.hidden = true;
  }

  render() {
    const run = this.run;
    this.tacho.render({
      rpm: run.rpm,
      gear: run.gear,
      redline: run.stats.redline,
      zone: run.auto && run.started ? null : greenZone(run),
      shifting: run.shiftTimer > 0,
      limiter: run.limiter,
      auto: run.auto,
    });
    this.$speed.textContent = String(Math.round(run.v * 3.6));
  }
}
