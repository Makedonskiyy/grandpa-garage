/**
 * DriveHud — приборная панель заездов, как за рулём: по краям — педали тормоза и газа,
 * у приборов — лепестки переключения «−» и «+», в центре — тахометр (главный: передача
 * и зелёная зона переключения) и спидометр. Низ приборов уходит за край экрана.
 * Сверху — строка подсказки; данные сцены (карта трассы, прочность) — в карточке слева вверху.
 * Подсказка — два-три слова, одна за раз: появляется плавно, держится ~3 с, между
 * подсказками пауза, а одна и та же не повторяется каждые пару секунд.
 */
import { el } from './dom.js';
import { icon } from './icons.js';
import { t } from '../systems/strings.js';
import { PedalControls } from './PedalControls.js';
import { createGauge } from './gauges.js';
import { greenZone, shiftUp, shiftDown, startRun } from '../systems/drive.js';
import { audio } from '../systems/AudioManager.js';
import { SFX } from '../config/constants.js';

/** Сколько держится подсказка: успеть прочитать краем глаза, не отвлекаясь от дороги. */
const HOLD_MS = 3200;
/** Пауза между подсказками: не сменяются одна за другой. */
const GAP_MS = 900;
/** Та же подсказка снова — не раньше чем через столько (кроме срочных). */
const REPEAT_MS = 7000;
/** Подсказки старта: после того как машина тронулась, им не место на экране. */
const START_HINTS = ['launch', 'launchAuto', 'goManual', 'goAuto', 'early'];

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
      onShiftUp: () => {
        const wasStarted = this.run.started;
        if (shiftUp(this.run) && wasStarted) DriveHud.shiftSound();
      },
      onShiftDown: () => {
        if (shiftDown(this.run)) DriveHud.shiftSound();
        else {
          audio.playSfx(SFX.ERROR);
          this.say('overrev', 'warn');
        }
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
      // Лепестки крепятся к приборам сзади: кронштейны прячутся за обечайками.
      el('div', { class: 'dash__gauges' }, [p.$down, this.tacho.node, this.speedo.node, p.$up]),
      p.$gas,
    ]);
    this.info = middle.length ? el('div', { class: 'ui-abs dash-info' }, middle) : null;
    this.hintKey = null;
    this.hintUntil = 0;
    this.nextAt = 0;
    this.lastShown = new Map(); // подсказка → когда показана
    scene.ui.append(...[this.node, this.info, this.$hint].filter(Boolean));
    this.render();
  }

  /** Щелчок коробки; на каждом третьем переключении — выстрел в выхлоп. */
  static shiftSound() {
    audio.playSfx(SFX.SHIFT);
    if (Math.random() < 0.35) audio.playSfx(SFX.BACKFIRE, { delay: 0.08 });
  }

  /** Ввод педалей за кадр. */
  input(dt) {
    const input = this.pedals.update(dt);
    // Автомат: газ до зелёного только раскручивает мотор (машина на тормозе),
    // на зелёный с газом — трогается сама. На ручной старт — первой передачей.
    const run = this.run;
    if (run.auto && run.green && !run.started && !run.done && input.gas > 0.3) startRun(run);
    return input;
  }

  setEnabled(on) {
    this.pedals.setEnabled(on);
  }

  setVisible(on) {
    // display, а не visibility: дуги приборов сами включают видимость и просвечивали бы.
    for (const n of [this.node, this.info]) if (n) n.style.display = on ? '' : 'none';
    if (!on) this.$hint.hidden = true;
  }

  /** Где стоит подсказка: top — сверху, light — под светофором, clock — под секундомером. */
  setHintSlot(slot) {
    this.$hint.dataset.slot = slot;
  }

  /** Показать подсказку: tone — info | warn | good. Срочная (warn) перебивает обычную. */
  say(key, tone = 'info', now = performance.now()) {
    if (!key) return;
    const visible = !this.$hint.hidden;
    // Та же подсказка — просто держится дольше.
    if (key === this.hintKey && visible) {
      this.hintUntil = Math.max(this.hintUntil, now + HOLD_MS * 0.5);
      return;
    }
    const urgent = tone === 'warn';
    // Недавно уже говорили — не повторяем (срочные — можно, но не чаще паузы).
    if (!urgent && now - (this.lastShown.get(key) ?? -Infinity) < REPEAT_MS) return;
    // Занято другой подсказкой: перебить может только срочная — и не другую срочную.
    if (visible && now < this.hintUntil && !(urgent && this.hintTone !== 'warn')) return;
    // После подсказки — короткая пауза, иначе они мелькают одна за другой.
    if (!visible && now < this.nextAt && !urgent) return;
    this.hintKey = key;
    this.hintTone = tone;
    this.hintUntil = now + HOLD_MS;
    this.lastShown.set(key, now);
    this.$hintText.textContent = t(`drive.hints.${key}`);
    this.$hint.dataset.tone = tone;
    this.$hint.classList.remove('is-leaving');
    this.$hint.hidden = false;
    // Перезапуск анимации появления для новой подсказки.
    this.$hint.style.animation = 'none';
    void this.$hint.offsetWidth;
    this.$hint.style.animation = '';
  }

  /** Спрятать подсказку, когда её время вышло: плавно, потом пауза перед следующей. */
  quiet(now = performance.now()) {
    if (this.$hint.hidden || now < this.hintUntil) return;
    if (!this.$hint.classList.contains('is-leaving')) {
      this.$hint.classList.add('is-leaving');
      this.leaveAt = now + 260;
      return;
    }
    if (now >= this.leaveAt) {
      this.$hint.hidden = true;
      this.$hint.classList.remove('is-leaving');
      this.hintKey = null;
      this.nextAt = now + GAP_MS;
    }
  }

  render() {
    const run = this.run;
    // Тронулся — стартовые подсказки больше не нужны: уходят сразу.
    if (run.started && START_HINTS.includes(this.hintKey) && !this.$hint.hidden) {
      this.hintUntil = 0;
      this.quiet();
    }
    const zone = run.auto && run.started ? null : greenZone(run);
    this.inZone = Boolean(zone && run.rpm >= zone[0] && run.rpm <= zone[1]);
    let gear = String(run.gear);
    if (!run.started || run.gear === 0) gear = 'N';
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

/**
 * Петли звуков заезда: визг резины (асфальт) или чавканье грязи (грунт) — по пробуксовке,
 * треск отсечки. Громкость меняется каждый кадр, без файла звук просто молчит.
 */
export class DriveSounds {
  constructor(scene, surface) {
    this.skid = audio.loopSfx(surface === 'clay' ? SFX.MUD : SFX.SKID);
    this.limiter = audio.loopSfx(SFX.LIMITER);
    for (const s of [this.skid, this.limiter]) s?.setVolume(0);
    scene.events.once('shutdown', () => this.stop());
  }

  update(run, { mud = 0 } = {}) {
    const k = audio.sfxLevel();
    this.skid?.setVolume(k * Math.min(1, Math.max(run.slip, mud)));
    this.limiter?.setVolume(run.limiter && !run.done ? k * 0.5 : 0);
  }

  stop() {
    for (const s of [this.skid, this.limiter]) s?.destroy();
    this.skid = null;
    this.limiter = null;
  }
}
