import { BaseScene } from './BaseScene.js';
import { SCENES, SFX } from '../config/constants.js';
import { StoryStage } from '../systems/StoryStage.js';
import { audio } from '../systems/AudioManager.js';
import { formatSeconds, getTest } from '../systems/simulate.js';
import { gameState } from '../gameState.js';
import { el } from '../ui/dom.js';
import { webButton } from '../ui/components.js';
import { t } from '../systems/strings.js';
import { drawGarageRoom, placeGarageCar } from './garageBackdrop.js';

// Машина в левой части экрана, под своей лампой; итог — справа.
const STAGE = { carX: 196, groundY: 248, scale: 1.1 };

/**
 * Результат (ТЗ 3.10): «Успех»/«Провал», причина простыми словами, числа, подсказка.
 * Успех обкатки → Палыч; успех заезда → финал; провал → гараж со старой сборкой.
 */
export class ResultScene extends BaseScene {
  constructor() {
    super(SCENES.RESULT);
  }

  async create() {
    this.enter();
    this.car = null;
    const r = gameState.lastResult;
    if (!r) {
      this.goTo(SCENES.MENU);
      return;
    }
    const test = getTest(r.testId);

    drawGarageRoom(this, { lampX: STAGE.carX, groundY: STAGE.groundY });
    ({ car: this.car } = placeGarageCar(this, {
      x: STAGE.carX,
      groundY: STAGE.groundY,
      scale: STAGE.scale,
    }));

    // Поражение в заезде: сначала реплика Палыча (20), потом итог.
    if (!r.ok && r.testId === 'race') await new StoryStage(this).play('raceLose');

    const sec = t('garage.units.sec');
    const row = (label, value, cls = '') =>
      el('div', { class: 'result-panel__row' }, [
        el('span', { text: label }),
        el('span', { class: cls, text: value }),
      ]);
    const rows = [];
    const d = r.details;
    const secs = (v) => t('result.secValue', { v: v.toFixed(1).replace('.', ',') });
    if (r.testId === 'race' && d) {
      rows.push(row(t('result.time'), `${formatSeconds(d.time)} ${sec}`));
      rows.push(row(t('result.rival'), `${formatSeconds(d.rivalTime)} ${sec}`));
      rows.push(row(t('result.diffLabel'), d.diffText, r.ok ? 'is-ok' : 'is-bad'));
      if (d.bestTime) rows.push(row(t('result.bestTime'), `${formatSeconds(d.bestTime)} ${sec}`));
      rows.push(row(t('result.spin'), secs(d.spin), d.spin > 1 ? 'is-bad' : ''));
      rows.push(row(t('result.limiter'), secs(d.limiter), d.limiter > 0.8 ? 'is-bad' : ''));
    } else if (d) {
      const done = d.distance >= d.length;
      rows.push(
        row(
          t('result.distance'),
          t('result.distanceValue', { have: Math.round(d.distance), total: d.length }),
          done ? 'is-ok' : 'is-bad',
        ),
      );
      const left = Math.max(0, Math.round((1 - d.damage / d.capacity) * 100));
      rows.push(row(t('result.bodyLeft'), `${left}%`, left > 0 ? 'is-ok' : 'is-bad'));
    }
    if (d) {
      rows.push(row(t('result.topSpeed'), `${Math.round(d.topSpeedKmh)} ${t('race.kmh')}`));
    }
    rows.push(
      row(
        t('result.durability'),
        t('result.durabilityValue', { have: r.stats.durability, min: test.minDurability }),
        r.stats.durability >= test.minDurability ? 'is-ok' : 'is-bad',
      ),
    );

    const next = r.ok ? (r.testId === 'trial' ? SCENES.PALYCH : SCENES.ENDING) : SCENES.GARAGE;
    this.ui.append(
      el('section', { class: 'ui-abs surface result-panel' }, [
        el('div', { class: 'result-panel__eyebrow', text: test.name }),
        el('h1', { class: 'result-panel__title' }, [
          el('span', { class: `status-dot${r.ok ? '' : ' is-bad'}`, 'aria-hidden': 'true' }),
          r.ok ? t('result.success') : t('result.fail'),
        ]),
        r.reason ? el('p', { class: 'result-panel__reason', text: r.reason }) : null,
        el('div', { class: 'result-panel__rows' }, rows),
        r.hint
          ? el('div', { class: 'gadvice' }, [
              el('div', { class: 'gadvice__title', text: t('result.hintTitle') }),
              el('div', { class: 'gadvice__text', text: r.hint }),
            ])
          : null,
        el('div', { class: 'result-panel__actions' }, [
          webButton(r.ok ? t('result.next') : t('result.rebuild'), () => this.goTo(next), {
            variant: 'primary',
            icon: 'play',
          }),
          webButton(t('result.toMenu'), () => this.goTo(SCENES.MENU)),
        ]),
      ]),
    );
    audio.playSfx(r.ok ? SFX.SUCCESS : SFX.FAIL);
  }

  update(_time, delta) {
    if (!this.car) return;
    this.car.step(delta / 1000);
  }
}
