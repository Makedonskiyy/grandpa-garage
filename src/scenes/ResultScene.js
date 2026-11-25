import { BaseScene } from './BaseScene.js';
import { SCENES, SFX, AMB } from '../config/constants.js';
import { StoryStage } from '../systems/StoryStage.js';
import { audio } from '../systems/AudioManager.js';
import { formatSeconds, getTest } from '../systems/simulate.js';
import { gameState } from '../gameState.js';
import { el } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { webButton } from '../ui/components.js';
import { t } from '../systems/strings.js';
import { drawGarageRoom, placeGarageCar } from './garageBackdrop.js';

// Машина в левой части экрана, под своей лампой; итог — справа.
const STAGE = { carX: 196, groundY: 248, scale: 1.1 };

/** Провал из-за езды: сборка годится, нужно проехать иначе. */
const DRIVING = ['driving', 'rough', 'jump', 'short'];
/** Какая часть сборки виновата: значок и название вкладки гаража. */
const BUILD_FIX = {
  traction: { icon: 'tires', slot: 'wheels' },
  overshoot: { icon: 'tires', slot: 'wheels' },
  power: { icon: 'engine', slot: 'engine' },
  slow: { icon: 'engine', slot: 'engine' },
  incomplete: { icon: 'service', slot: 'garage' },
};

/**
 * Разбор заезда (ТЗ 3.10): почему не вышло — одной фразой, что делать — по шагам
 * (езда или какая деталь), и цифры заезда наглядно. Главная кнопка — по причине:
 * дело в езде — «Попробовать снова», в сборке — «В гараж».
 */
export class ResultScene extends BaseScene {
  constructor() {
    super(SCENES.RESULT);
  }

  async create() {
    this.enter();
    this.ambience = AMB.GARAGE;
    audio.playAmbience(this.ambience);
    this.car = null;
    const r = gameState.lastResult;
    if (!r) {
      this.goTo(SCENES.MENU);
      return;
    }
    const test = getTest(r.map ?? r.testId);

    drawGarageRoom(this, { lampX: STAGE.carX, groundY: STAGE.groundY });
    ({ car: this.car } = placeGarageCar(this, {
      x: STAGE.carX,
      groundY: STAGE.groundY,
      scale: STAGE.scale,
    }));

    // Поражение в заезде: сначала реплика Палыча (20), потом итог.
    if (!r.ok && r.testId === 'race') await new StoryStage(this).play('raceLose');

    const driving = !r.ok && DRIVING.includes(r.reasonKey);
    const retryScene = r.testId === 'race' ? SCENES.RACE : SCENES.TRIAL;
    const retry = () => this.goTo(retryScene, r.testId === 'race' ? { retry: true } : undefined);
    const garage = () => this.goTo(SCENES.GARAGE);
    const next = r.testId === 'trial' ? SCENES.PALYCH : SCENES.ENDING;

    let actions;
    if (r.ok) {
      actions = [
        webButton(t('result.next'), () => this.goTo(next), { variant: 'primary', icon: 'play' }),
      ];
    } else if (driving) {
      actions = [
        webButton(t('result.retry'), retry, { variant: 'primary', icon: 'restart' }),
        webButton(t('result.toGarage'), garage, { icon: 'service' }),
      ];
    } else {
      actions = [
        webButton(t('result.rebuild'), garage, { variant: 'primary', icon: 'service' }),
        webButton(t('result.retry'), retry, { icon: 'restart' }),
      ];
    }

    this.ui.append(
      el('section', { class: `ui-abs surface result-panel ${r.ok ? 'is-ok' : 'is-bad'}` }, [
        el('div', { class: 'rp-head' }, [
          el('div', { class: 'rp-badge', 'aria-hidden': 'true' }, [icon(r.ok ? 'check' : 'close')]),
          el('div', { class: 'rp-head__text' }, [
            el('div', { class: 'result-panel__eyebrow', text: test.map?.name ?? test.name }),
            el('h1', { class: 'rp-title', text: r.ok ? t('result.success') : t('result.fail') }),
          ]),
        ]),
        r.reason ? el('p', { class: 'rp-reason', text: r.reason }) : null,
        r.ok ? null : this.#steps(r, test, driving),
        el('h2', { class: 'rp-section', text: t('result.numbers') }),
        el('div', { class: 'rp-metrics' }, this.#metrics(r, test)),
        el('div', { class: 'result-panel__actions rp-actions' }, [
          ...actions,
          el('button', {
            class: 'rp-link',
            type: 'button',
            text: t('result.toMenu'),
            onclick: () => this.goTo(SCENES.MENU),
          }),
        ]),
      ]),
    );
    audio.playSfx(r.ok ? SFX.SUCCESS : SFX.FAIL);
  }

  /** «Что делать»: 1–2 шага со значками — езда или деталь, плюс хрупкая деталь. */
  #steps(r, test, driving) {
    const steps = [];
    const weakest = r.stats?.weakestPart;
    const durOk = (r.stats?.durability ?? 0) >= test.minDurability;
    if (driving) {
      steps.push({
        icon: r.reasonKey === 'jump' ? 'timer' : 'speed',
        title: t(`result.fix.${r.reasonKey}`),
        text: r.hint,
      });
      if (r.reasonKey !== 'jump')
        steps.push({
          icon: 'check',
          title: t('result.fix.buildOk'),
          text: t('result.fix.buildOkText'),
        });
    } else if (r.reasonKey === 'broken') {
      steps.push({
        icon: weakest?.slot ?? 'durability',
        title: t('result.fix.broken', { part: weakest?.name ?? '' }),
        text: r.hint,
      });
    } else {
      const fix = BUILD_FIX[r.reasonKey] ?? { icon: 'service', slot: 'garage' };
      steps.push({
        icon: fix.icon,
        title: t(`result.fix.tab.${fix.slot}`),
        text: r.hint ?? t('result.fix.generic'),
      });
    }
    // Не хватает прочности — отдельный шаг, даже если провал из-за другого.
    if (!durOk && r.reasonKey !== 'broken' && weakest) {
      steps.push({
        icon: 'durability',
        title: t('result.fix.durability', { have: r.stats.durability, min: test.minDurability }),
        text: t('result.fix.durabilityText', { part: weakest.name }),
      });
    }
    return el('div', { class: 'rp-steps' }, [
      el('h2', { class: 'rp-section', text: t('result.whatToDo') }),
      ...steps.map((s, i) =>
        el('div', { class: 'rstep' }, [
          el('div', { class: 'rstep__icon' }, [
            icon(s.icon),
            el('b', { class: 'rstep__num', text: String(i + 1) }),
          ]),
          el('div', { class: 'rstep__body' }, [
            el('div', { class: 'rstep__title', text: s.title }),
            s.text ? el('div', { class: 'rstep__text', text: s.text }) : null,
          ]),
        ]),
      ),
    ]);
  }

  /** Цифры заезда плитками: полоса для пути и запаса, шкала прочности с порогом. */
  #metrics(r, test) {
    const d = r.details;
    const tiles = [];
    const tile = (label, value, extra, tone = '') =>
      el('div', { class: `rmetric ${tone}` }, [
        el('div', { class: 'rmetric__label', text: label }),
        el('div', { class: 'rmetric__value', text: value }),
        extra,
      ]);
    const bar = (part, tone) =>
      el('div', { class: `rbar ${tone}` }, [
        el('span', { style: { width: `${Math.max(2, Math.min(100, part * 100))}%` } }),
      ]);
    const sec = t('garage.units.sec');
    if (r.testId === 'race' && d) {
      const max = Math.max(d.time, d.rivalTime);
      tiles.push(
        tile(
          t('result.time'),
          `${formatSeconds(d.time)} ${sec}`,
          bar(d.time / max, r.ok ? 'is-ok' : 'is-bad'),
        ),
        tile(t('result.rival'), `${formatSeconds(d.rivalTime)} ${sec}`, bar(d.rivalTime / max, '')),
        tile(t('result.diffLabel'), d.diffText, null, r.ok ? 'is-ok' : 'is-bad'),
        tile(t('result.topSpeed'), `${Math.round(d.topSpeedKmh)} ${t('race.kmh')}`, null),
      );
      if (d.spin > 0.3)
        tiles.push(
          tile(
            t('result.spin'),
            t('result.secValue', { v: d.spin.toFixed(1).replace('.', ',') }),
            null,
            d.spin > 1 ? 'is-bad' : '',
          ),
        );
      if (d.limiter > 0.3)
        tiles.push(
          tile(
            t('result.limiter'),
            t('result.secValue', { v: d.limiter.toFixed(1).replace('.', ',') }),
            null,
            d.limiter > 0.8 ? 'is-bad' : '',
          ),
        );
    } else if (d) {
      const done = d.distance >= d.length;
      tiles.push(
        tile(
          t('result.distance'),
          t('result.distanceValue', { have: Math.round(d.distance), total: d.length }),
          bar(d.distance / d.length, done ? 'is-ok' : 'is-bad'),
        ),
      );
      const left = Math.max(0, 1 - d.damage / d.capacity);
      tiles.push(
        tile(
          t('result.bodyLeft'),
          `${Math.round(left * 100)}%`,
          bar(left, left > 0.35 ? 'is-ok' : 'is-bad'),
        ),
        tile(t('result.topSpeed'), `${Math.round(d.topSpeedKmh)} ${t('race.kmh')}`, null),
      );
    }
    // Прочность: 10 делений, закрашены «есть», отметка — сколько нужно.
    const have = r.stats.durability;
    const min = test.minDurability;
    const ok = have >= min;
    tiles.push(
      tile(
        t('result.durability'),
        t('result.durabilityValue', { have, min }),
        el(
          'div',
          { class: 'rseg' },
          Array.from({ length: 10 }, (_, i) =>
            el('span', {
              class: `${i < have ? (ok ? 'is-ok' : 'is-bad') : ''}${i === min - 1 ? ' is-need' : ''}`,
            }),
          ),
        ),
        ok ? '' : 'is-bad',
      ),
    );
    return tiles;
  }

  update(_time, delta) {
    if (!this.car) return;
    this.car.step(delta / 1000);
  }
}
