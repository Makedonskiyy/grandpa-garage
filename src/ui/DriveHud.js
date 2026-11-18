/**
 * DriveHud — приборная панель заездов, как за рулём: по краям — педали тормоза и газа,
 * у приборов — лепестки переключения «−» и «+», в центре — тахометр (главный: передача
 * и зелёная зона переключения) и спидометр. Низ приборов уходит за край экрана.
 * Сверху — строка подсказки; данные сцены (карта трассы, прочность) — в карточке слева вверху.
 * Подсказка показывает одно, самое важное сейчас, и держится не меньше секунды.
 */
import { el } from './dom.js';
import { icon } from './icons.js';
import { t } from '../systems/strings.js';
import { PedalControls } from './PedalControls.js';
import { createGauge } from './gauges.js';
import { greenZone, shiftUp, shiftDown } from '../systems/drive.js';

const HOLD_MS = 1100;

export class DriveHud {
  /**
   * @param {import('phaser').Scene} scene
   * @param {ReturnType<import('../systems/drive.js').createRun>} run
   * @param {{ className?: string, middle?: Node[] }} [opts] middle — блоки сцены для карточки сверху
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
    const redline = run.stats.redline;
    const tachoMax = Math.ceil(redline / 1000) * 1000 + 1000;
    this.tacho = createGauge({
      className: 'gauge--tacho',
      max: tachoMax,
      major: 1000,
      minor: 5,
      red: redline,
      label: (v) => String(v / 1000),
      unit: t('race.tachoUnit'),
    });
    this.speedo = createGauge({
      className: 'gauge--speedo',
      max: 280,
      major: 40,
      minor: 4,
      label: (v) => String(v),
      unit: t('race.kmh'),
    });
    this.inZone = false;

    this.$hintText = el('span', { class: 'drive-hint__text' });
    this.$hint = el('div', { class: 'ui-abs drive-hint', role: 'status', hidden: true }, [
      icon('info'),
      this.$hintText,
    ]);
    const p = this.pedals;
    this.node = el('div', { class: `ui-abs dash ${className}`.trim() }, [
      el('div', { class: 'dash__shade', 'aria-hidden': 'true' }),
      p.$brake,
      p.$down,
      el('div', { class: 'dash__gauges' }, [this.tacho.node, this.speedo.node]),
      p.$up,
      p.$gas,
    ]);
    this.info = middle.length ? el('div', { class: 'ui-abs dash-info' }, middle) : null;
    this.hintKey = null;
    this.hintUntil = 0;
    scene.ui.append(...[this.node, this.info, this.$hint].filter(Boolean));
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
    for (const n of [this.node, this.info]) if (n) n.style.visibility = on ? '' : 'hidden';
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
    const zone = run.auto && run.started ? null : greenZone(run);
    this.inZone = Boolean(zone && run.rpm >= zone[0] && run.rpm <= zone[1]);
    let gear = String(run.gear);
    if (!run.started) gear = 'N';
    else if (run.shiftTimer > 0) gear = '·';
    this.tacho.render({
      value: run.rpm,
      text: gear,
      sub: run.auto ? t('race.modeAuto') : t('race.modeManual'),
      zone,
      inZone: this.inZone,
      alarm: run.limiter,
    });
    this.speedo.render({ value: run.v * 3.6, text: String(Math.round(run.v * 3.6)) });
  }
}
