import Phaser from 'phaser';
import partsData from '../../data/parts.json';
import cosmetics from '../../data/cosmetics.json';
import config from '../../data/config.json';
import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, SFX, AMB, TEST_IDS } from '../config/constants.js';
import { drawGarageRoom, placeGarageCar } from './garageBackdrop.js';
import { StoryStage } from '../systems/StoryStage.js';
import { audio } from '../systems/AudioManager.js';
import {
  computeStats,
  getPartsBySlot,
  getSlot,
  getTest,
  formatSeconds,
} from '../systems/simulate.js';
import { predict, buildRating } from '../systems/drive.js';
import { wheelKeys } from '../systems/CarRig.js';
import {
  gameState,
  getCurrentTestId,
  onStateChange,
  togglePart,
  setPart,
  removePart,
  setCosmetic,
  cosmeticHex,
  washCar,
  changeOil,
  repairBody,
  conditionScore,
  shouldShowGrandpaHint,
  CUSTOM_COLOR_GROUPS,
} from '../gameState.js';
import { el, fill } from '../ui/dom.js';
import { webButton } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { withTip } from '../ui/tooltip.js';
import { colorPicker } from '../ui/colorPicker.js';
import { wheelThumb } from '../ui/wheelThumb.js';
import { openSettings } from '../ui/SettingsPanel.js';
import { isModalOpen } from '../ui/overlay.js';
import { openHowTo } from '../ui/HowToPanel.js';
import { openGarageGuide } from '../ui/GarageGuide.js';
import { openMapSelect } from '../ui/MapSelect.js';
import { t } from '../systems/strings.js';
import { saveGame } from '../systems/save.js';

const cfg = config.garage;
const TILES = [...partsData.groups.map((g) => g.id), 'looks', 'service'];
const LOOK_GROUPS = ['paint', 'rim', 'caliper', 'headlight', 'neon'];
const SERVICE = ['oil', 'repair', 'wash'];
const SERVICE_MS = 900;
/** Где на машине подсвечивать раздел (доли длины машины от заднего бампера). */
const FOCUS = {
  wheels: [0.23, 0.78],
  chassis: [0.23, 0.78],
  engine: [0.82],
  drivetrain: [0.5],
  body: [0.5],
};

/** Характеристики для карточки и сравнения: как читать, как показывать, что лучше. */
const STATS = [
  { id: 'power', icon: 'power', get: (s) => s.power, show: (v) => `${v} ${t('garage.units.hp')}` },
  {
    id: 'torque',
    icon: 'torque',
    get: (s) => s.torque,
    show: (v) => `${v} ${t('garage.units.nm')}`,
  },
  {
    id: 'mass',
    icon: 'mass',
    get: (s) => s.mass,
    show: (v) => `${v} ${t('garage.units.kg')}`,
    lower: true,
  },
  {
    id: 'ratio',
    icon: 'ratio',
    get: (s) => s.kgPerHp,
    show: (v) => (v ? `${String(v.toFixed(1)).replace('.', ',')} ${t('garage.units.kgHp')}` : '—'),
    lower: true,
  },
  { id: 'gripClay', icon: 'grip', get: (s) => s.grip.clay, show: (v) => fmt1(v), bar: 10 },
  { id: 'gripAsphalt', icon: 'grip', get: (s) => s.grip.asphalt, show: (v) => fmt1(v), bar: 10 },
  { id: 'downforce', icon: 'downforce', get: (s) => s.downforce, show: (v) => String(v), bar: 4 },
  {
    id: 'durability',
    icon: 'durability',
    get: (s) => s.durability,
    show: (v) => `${v}/10`,
    bar: 10,
  },
];

function fmt1(v) {
  return String(Math.round(v * 10) / 10).replace('.', ',');
}

/**
 * Гараж — тюнинг в духе Gran Turismo: машина под лампой в центре, снизу — плитки разделов,
 * справа — карточка характеристик или список деталей раздела, слева — подробности о детали
 * под курсором: описание, что изменится и как это скажется на прогнозе заезда.
 * Клик по карточке ставит деталь сразу; обслуживание — один клик с короткой анимацией.
 */
export class GarageScene extends BaseScene {
  constructor() {
    super(SCENES.GARAGE);
  }

  create() {
    this.enter();
    audio.playMusic(MUSIC.GARAGE);
    this.ambience = AMB.GARAGE;
    audio.playAmbience(this.ambience);

    // Всё пройдено — гараж в свободном режиме: обкатка и реванш с Палычем.
    this.testId = getCurrentTestId() ?? 'race';
    this.test = getTest(this.testId);
    this.view = { tile: null, slot: null, look: 'paint' };
    this.hover = null; // { slot, partId } — карточка под курсором
    this.cache = new Map();

    drawGarageRoom(this, { lampX: cfg.carX, groundY: cfg.groundY });
    ({ car: this.car } = placeGarageCar(this, {
      x: cfg.carX,
      groundY: cfg.groundY,
      scale: cfg.carScale,
    }));
    this.lastBuild = JSON.stringify(gameState.build);
    this.lastLooks = JSON.stringify(gameState.cosmetics);

    this.alive = true;
    this.#buildUI();
    this.#render();
    const onKey = (event) => this.#navigateGarage(event);
    window.addEventListener('keydown', onKey, true);

    const off = onStateChange(() => this.#render());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.alive = false;
      window.removeEventListener('keydown', onKey, true);
      off();
    });
    this.#showIntroduction();
  }

  update(_time, delta) {
    this.car.step(delta / 1000);
  }

  async #showIntroduction() {
    if (!gameState.flags.garageIntroSeen) {
      this.ui.style.visibility = 'hidden';
      await new StoryStage(this).play('garageIntro');
      if (!this.alive) return;
      this.ui.style.visibility = '';
      gameState.flags.garageIntroSeen = true;
    }
    if (gameState.flags.garageGuideSeen || gameState.passed.trial) return;
    openGarageGuide();
    gameState.flags.garageGuideSeen = true;
    saveGame(gameState);
  }

  // ---------- Расчёты с кэшем: прогноз — это прогон бота ----------

  #key(build) {
    return `${JSON.stringify(build)}|${JSON.stringify(gameState.car)}`;
  }

  #forecast(build) {
    const k = `f:${this.#key(build)}`;
    if (!this.cache.has(k)) this.cache.set(k, predict(this.testId, build, gameState.car));
    return this.cache.get(k);
  }

  #rating(build) {
    const k = `r:${this.#key(build)}`;
    if (!this.cache.has(k)) this.cache.set(k, buildRating(build, gameState.car));
    return this.cache.get(k);
  }

  #stats(build) {
    return computeStats(build, gameState.car);
  }

  // ---------- Каркас ----------

  #buildUI() {
    const n = TEST_IDS.indexOf(this.testId) + 1;
    this.$rating = el('span', { class: 'plaque__value' });
    this.$condition = el('span', { class: 'plaque__value' });
    const plaque = (label, value, tip, iconName) =>
      withTip(
        el('div', { class: 'plaque' }, [
          icon(iconName),
          el('span', { class: 'plaque__label', text: label }),
          value,
        ]),
        tip,
      );
    this.$side = el('aside', { class: 'ui-abs gside' });
    this.$detail = el('section', { class: 'ui-abs gdetail', tabindex: '0', hidden: true });
    this.$tiles = el('nav', { class: 'ui-abs gtiles', 'aria-label': 'Разделы' });
    this.$launch = webButton(t('garage.launchMap'), () => this.#launch(), {
      variant: 'primary',
      icon: 'play',
      className: 'glaunch',
    });
    this.$launchSub = el('span', { class: 'glaunch__sub' });
    // Название — отдельной строкой (обрезается многоточием), под ним — чего не хватает.
    const label = this.$launch.querySelector('.wbtn__label');
    label.replaceChildren(
      el('span', { class: 'glaunch__title', text: t('garage.launchMap') }),
      this.$launchSub,
    );
    this.$launch.title = t('garage.launchMap');

    this.ui.append(
      el('header', { class: 'ui-abs gtop' }, [
        el('div', { class: 'gtop__goal' }, [
          icon('finish'),
          el('div', { class: 'gtop__objective' }, [
            el('strong', { class: 'gtop__title', text: this.test.name }),
            el('span', { class: 'gtop__text', text: t(`garage.objective.${this.testId}`) }),
          ]),
          el('span', {
            class: 'gtop__stage',
            text: t('garage.testStage', { n, total: TEST_IDS.length }),
          }),
        ]),
        el('div', { class: 'gtop__plaques' }, [
          plaque(t('garage.rating'), this.$rating, t('garage.ratingTip'), 'speed'),
          plaque(t('garage.condition'), this.$condition, t('garage.conditionTip'), 'condition'),
        ]),
        el('div', { class: 'gtop__actions' }, [
          webButton('', () => openHowTo(), {
            icon: 'help',
            variant: 'dark',
            className: 'wbtn--icon',
            title: t('menu.howTo'),
          }),
          webButton('', () => openSettings(), {
            icon: 'gear',
            variant: 'dark',
            className: 'wbtn--icon',
            title: t('menu.settings'),
          }),
        ]),
      ]),
      this.$detail,
      this.$side,
      this.$tiles,
    );
  }

  #render() {
    // В create() сцена ещё не «активна» по мнению Phaser, поэтому свой флаг жизни.
    if (!this.alive) return;
    const active = document.activeElement;
    const focusGroup = [this.$tiles, this.$side].find((group) => group.contains(active));
    const focusIndex = active?.matches('button:focus-visible')
      ? [...(focusGroup?.querySelectorAll('button') ?? [])].indexOf(active)
      : -1;
    const sideView = this.$side.dataset.view;
    const buildKey = JSON.stringify(gameState.build);
    const looksKey = JSON.stringify(gameState.cosmetics);
    this.car.apply(gameState.build, gameState.cosmetics, gameState.car.dirty);
    if (buildKey !== this.lastBuild) this.car.drop();
    this.lastBuild = buildKey;
    this.lastLooks = looksKey;

    this.#renderPlaques();
    this.#renderTiles();
    this.#renderSide();
    this.#renderDetail();
    if (focusIndex >= 0 && (focusGroup !== this.$side || sideView === this.$side.dataset.view)) {
      const next = focusGroup.querySelectorAll('button')[focusIndex];
      if (next && !next.disabled) next.focus();
    }
  }

  #navigateGarage(event) {
    if (
      this._leaving ||
      this.ui.style.visibility === 'hidden' ||
      isModalOpen() ||
      this.ui.querySelector('.map-picker') ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.target.closest?.('input, textarea, select, [contenteditable]')
    )
      return;

    const active = document.activeElement;
    const tiles = [...this.$tiles.querySelectorAll('button:not(:disabled)')];
    const currentTile = this.$tiles.querySelector('.is-active') ?? tiles[0];
    if (event.code === 'Escape' && this.view.tile) {
      const index = TILES.indexOf(this.view.tile);
      event.preventDefault();
      event.stopPropagation();
      this.#openTile(null);
      this.$tiles.querySelectorAll('.gtile')[index]?.focus();
      return;
    }

    const horizontal = ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(event.code);
    const vertical = ['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(event.code);
    if (!horizontal && !vertical) return;
    if (this.$detail.contains(active)) return;
    if (active !== document.body && !this.ui.contains(active)) return;
    const backward = ['ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW'].includes(event.code);
    const move = (items) => {
      const index = items.indexOf(active);
      return index < 0
        ? items[0]
        : items[(index + (backward ? -1 : 1) + items.length) % items.length];
    };
    const side = [...this.$side.querySelectorAll('button:not(:disabled)')];
    let next = currentTile;
    if (this.$tiles.contains(active)) {
      if (horizontal) next = move(tiles);
      else if (backward) next = side.find((button) => button.matches('.is-selected')) ?? side[0];
    } else if (this.$side.contains(active)) {
      if (vertical) next = move(side);
      else if (active.matches('.gside__tab, .swatch')) {
        next = move(
          side.filter((button) =>
            button.matches(active.matches('.swatch') ? '.swatch' : '.gside__tab'),
          ),
        );
      }
    }
    if (!next) return;
    event.preventDefault();
    next.focus();
  }

  #renderPlaques(preview = null) {
    const now = this.#rating(gameState.build);
    const next = preview ? this.#rating(preview) : now;
    fill(
      this.$rating,
      now === null ? '—' : t('garage.outOf', { v: now }),
      next !== now && next !== null
        ? el('span', {
            class: `plaque__delta ${next > now ? 'is-up' : 'is-down'}`,
            text: `→ ${next}`,
          })
        : '',
    );
    this.$condition.textContent = t('garage.outOf', { v: conditionScore().score });
  }

  // ---------- Плитки разделов ----------

  #renderTiles() {
    const missingSlots = this.#stats(gameState.build).missing;
    const slotTile = (slot) => partsData.groups.find((g) => g.slots.includes(slot))?.id;
    const needs = new Set(missingSlots.map(slotTile));
    if (gameState.car.oil === 'old' || gameState.car.damage >= 0.5) needs.add('service');
    fill(
      this.$tiles,
      ...TILES.map((id) =>
        withTip(
          el(
            'button',
            {
              class: `gtile${id === this.view.tile ? ' is-active' : ''}`,
              type: 'button',
              'aria-pressed': String(id === this.view.tile),
              onclick: () => this.#openTile(id === this.view.tile ? null : id),
            },
            [
              icon(id),
              el('span', { class: 'gtile__label', text: t(`garage.tiles.${id}`) }),
              needs.has(id) ? el('span', { class: 'gtile__dot', 'aria-hidden': 'true' }) : null,
            ],
          ),
          t(`garage.tileTips.${id}`),
        ),
      ),
      this.$launch,
    );
    this.#renderLaunch(missingSlots);
  }

  #openTile(id) {
    audio.playSfx(id ? SFX.TAB : SFX.BACK);
    this.view.tile = id;
    const group = partsData.groups.find((g) => g.id === id);
    this.view.slot = group ? group.slots[0] : null;
    this.hover = null;
    this.#render();
    this.$side.classList.remove('is-in');
    void this.$side.offsetWidth;
    this.$side.classList.add('is-in');
  }

  #renderLaunch(missing) {
    this.$launch.disabled = missing.length > 0;
    this.$launchSub.textContent = missing.length
      ? t('garage.missing', {
          slots: missing.map((s) => getSlot(s).name.toLowerCase()).join(', '),
        })
      : '';
  }

  // ---------- Правая колонка ----------

  #renderSide() {
    const tile = this.view.tile;
    this.$side.dataset.view = tile ?? 'hub';
    if (!tile) return fill(this.$side, ...this.#specCard(gameState.build, null));
    if (tile === 'looks') return fill(this.$side, ...this.#looksPanel());
    if (tile === 'service') return fill(this.$side, ...this.#servicePanel());
    return fill(this.$side, ...this.#partsPanel(tile));
  }

  #sideHead(title, sub) {
    return el('div', { class: 'gside__head' }, [
      el(
        'button',
        {
          class: 'gside__back',
          type: 'button',
          'aria-label': t('garage.back'),
          title: t('garage.back'),
          onclick: () => this.#openTile(null),
        },
        [icon('back')],
      ),
      el('div', {}, [
        el('h2', { class: 'gside__title', text: title }),
        sub ? el('p', { class: 'gside__sub', text: sub }) : null,
      ]),
    ]);
  }

  /** Карточка машины: характеристики, состояние, прогноз заезда. */
  #specCard(build, preview) {
    const now = this.#stats(build);
    const next = preview ? this.#stats(preview) : null;
    const rows = STATS.map((st) => {
      const v = st.get(now);
      const nv = next ? st.get(next) : v;
      const diff = (nv ?? 0) - (v ?? 0);
      const better = st.lower ? diff < 0 : diff > 0;
      const cls = Math.abs(diff) > 1e-6 ? (better ? ' is-up' : ' is-down') : '';
      return withTip(
        el('div', { class: 'spec' }, [
          icon(st.icon),
          el('span', { class: 'spec__label', text: t(`garage.stats.${st.id}`) }),
          el('span', { class: `spec__value${cls}`, text: st.show(next ? nv : v) }),
          st.bar ? this.#bar(v ?? 0, nv ?? 0, st.bar, better) : null,
        ]),
        t(`garage.statTips.${st.id}`),
      );
    });
    const weak = now.weakestPart;
    return [
      el('div', { class: 'gside__head gside__head--car' }, [
        el('div', {}, [
          el('h2', { class: 'gside__title', text: t('garage.carName') }),
          el('p', { class: 'gside__sub', text: t('garage.carSub') }),
        ]),
      ]),
      el('h3', { class: 'gside__section', text: t('garage.specTitle') }),
      el('div', { class: 'specs' }, rows),
      weak
        ? el('p', { class: 'gside__weak', text: t('garage.weakest', { part: weak.name }) })
        : null,
    ];
  }

  /** Сегментная полоса: значение и, при наведении, прибавка или убыль. */
  #bar(value, next, max, better) {
    const n = 10;
    const a = Math.round((Math.min(value, max) / max) * n);
    const b = Math.round((Math.min(next, max) / max) * n);
    const segs = [];
    for (let i = 0; i < n; i++) {
      let cls = 'sbar__seg';
      if (i < Math.min(a, b)) cls += ' is-on';
      else if (i < Math.max(a, b)) cls += better ? ' is-up' : ' is-down';
      segs.push(el('span', { class: cls }));
    }
    return el('div', { class: 'sbar' }, segs);
  }

  #conditionRow() {
    const { items } = conditionScore();
    return el(
      'div',
      { class: 'conds' },
      items.map((c) =>
        el('div', { class: `cond is-${c.level}` }, [
          icon(c.id),
          el('span', { class: 'cond__label', text: t(`garage.conditionItems.${c.id}`) }),
          el('span', { class: 'cond__level', text: t(`garage.levels.${c.level}`) }),
        ]),
      ),
    );
  }

  /** Подсказка «замени масло», если со свежим маслом сборка прошла бы. */
  #oilHint(r) {
    if (gameState.car.oil !== 'old' || !r.stats?.complete) return null;
    const build = Object.fromEntries(
      Object.entries(r.stats.parts).map(([slot, p]) => [slot, p?.id ?? null]),
    );
    const k = `oil:${JSON.stringify(build)}`;
    if (!this.cache.has(k)) {
      this.cache.set(k, predict(this.testId, build, { ...gameState.car, oil: 'fresh' }).ok);
    }
    return this.cache.get(k) ? t('garage.forecast.oilHint') : null;
  }

  /** Прогноз текущего заезда; при наведении — как изменится. */
  #forecastBox(build, preview) {
    const line = (r) => {
      if (!r.details) return { ok: false, text: t('garage.forecast.incomplete') };
      if (this.testId === 'trial') {
        if (r.ok) return { ok: true, text: t('garage.forecast.trialOk') };
        return { ok: false, text: r.reason, extra: this.#oilHint(r) };
      }
      const d = r.details;
      const diff = formatSeconds(Math.abs(d.time - d.rivalTime));
      const time = formatSeconds(d.time);
      return {
        ok: r.ok,
        text: t(r.ok ? 'garage.forecast.raceOk' : 'garage.forecast.raceSlow', { time, diff }),
        extra: r.ok ? null : this.#oilHint(r),
      };
    };
    const now = line(this.#forecast(build));
    const next = preview ? line(this.#forecast(preview)) : null;
    const changed = next && next.text !== now.text;
    const result = next ?? now;
    return withTip(
      el('section', { class: 'forecast', 'aria-label': t('garage.forecastTitle') }, [
        el('div', { class: 'forecast__title' }, [icon('timer'), t('garage.forecastTitle')]),
        changed
          ? el('p', { class: 'forecast__was' }, [
              el('span', { class: 'forecast__label', text: t('garage.current') }),
              now.text,
            ])
          : null,
        el('div', { class: 'forecast__result' }, [
          icon(result.ok ? 'check' : 'warning'),
          el('p', { class: 'forecast__text' }, [
            changed ? el('span', { class: 'forecast__label', text: t('garage.ifInstall') }) : null,
            result.text,
          ]),
        ]),
        result.extra ? el('p', { class: 'forecast__extra' }, [icon('oil'), result.extra]) : null,
      ]),
      t('garage.forecastTip'),
    );
  }

  /** Список деталей раздела: вкладки слотов и карточки. */
  #partsPanel(tileId) {
    const group = partsData.groups.find((g) => g.id === tileId);
    const slotId = this.view.slot ?? group.slots[0];
    const tabs =
      group.slots.length > 1
        ? el(
            'div',
            { class: 'gside__tabs', role: 'tablist' },
            group.slots.map((sid) =>
              el(
                'button',
                {
                  class: `gside__tab${sid === slotId ? ' is-active' : ''}`,
                  type: 'button',
                  role: 'tab',
                  'aria-selected': String(sid === slotId),
                  onclick: () => {
                    audio.playSfx(SFX.TAB);
                    this.view.slot = sid;
                    this.hover = null;
                    this.#render();
                  },
                },
                [icon(sid), getSlot(sid).name],
              ),
            ),
          )
        : null;
    const slot = getSlot(slotId);
    const cards = getPartsBySlot(slotId).map((p) => this.#partCard(slot, p));
    if (slot.required === false) cards.unshift(this.#partCard(slot, null));
    return [
      this.#sideHead(t(`garage.tiles.${tileId}`), t(`garage.tileTips.${tileId}`)),
      tabs,
      el('div', { class: 'gcards' }, cards),
    ];
  }

  #partCard(slot, part) {
    const id = part?.id ?? null;
    const selected = (gameState.build[slot.id] ?? null) === id;
    const name = part ? part.name : slot.none.name;
    const short = part ? part.short : slot.none.short;
    const nextBuild = { ...gameState.build, [slot.id]: id };
    const card = el(
      'button',
      {
        class: `gcard${selected ? ' is-selected' : ''}${part ? '' : ' gcard--stock'}`,
        type: 'button',
        'aria-pressed': String(selected),
        onclick: () => this.#install(slot, part, card),
        onpointerenter: () => this.#hoverPart(slot, id),
        onfocus: () => this.#hoverPart(slot, id),
      },
      [
        el('span', { class: 'gcard__thumb' }, [this.#thumb(slot, part)]),
        el('span', { class: 'gcard__body' }, [
          el('span', { class: 'gcard__name', text: name }),
          el('span', { class: 'gcard__short', text: short }),
          el('span', { class: 'gcard__delta' }, selected ? [] : this.#deltas(nextBuild)),
        ]),
        selected
          ? el('span', { class: 'gcard__tag' }, [icon('check'), t('garage.installed')])
          : null,
      ],
    );
    return card;
  }

  /** Картинка детали: колёса — настоящий спрайт, остальное — значок слота. */
  #thumb(slot, part) {
    if (slot.id === 'tires' || slot.id === 'rims') {
      const build = { ...gameState.build, tires: gameState.build.tires ?? 'tires_stock' };
      if (part) build[slot.id] = part.id;
      const rimHex = cosmeticHex('rim', gameState.cosmetics.rim);
      const caliperHex = cosmeticHex('caliper', gameState.cosmetics.caliper);
      return wheelThumb(this, wheelKeys(build), rimHex, 72, caliperHex);
    }
    return icon(slot.id);
  }

  /** Короткий итог «что изменится»: только то, что меняется, со знаком. */
  #deltas(nextBuild) {
    const a = this.#stats(gameState.build);
    const b = this.#stats(nextBuild);
    const out = [];
    const sign = (n, digits = 0) => {
      const v = digits
        ? String(Math.abs(n).toFixed(digits)).replace('.', ',')
        : Math.abs(Math.round(n));
      return `${n > 0 ? '+' : '−'}${v}`;
    };
    const push = (diff, text, lower = false) => {
      if (Math.abs(diff) < 1e-6) return;
      const good = lower ? diff < 0 : diff > 0;
      out.push(el('span', { class: good ? 'is-up' : 'is-down', text }));
    };
    push(b.power - a.power, `${sign(b.power - a.power)} ${t('garage.units.hp')}`);
    push(b.mass - a.mass, `${sign(b.mass - a.mass)} ${t('garage.units.kg')}`, true);
    const surf = this.test.surface;
    const g = b.grip[surf] - a.grip[surf];
    push(
      g,
      `${sign(g, Math.abs(g) < 1 ? 1 : 0)} ${t(`garage.stats.${surf === 'clay' ? 'gripClay' : 'gripAsphalt'}`).toLowerCase()}`,
    );
    push(
      b.downforce - a.downforce,
      `${sign(b.downforce - a.downforce)} ${t('garage.stats.downforce').toLowerCase()}`,
    );
    push(
      b.durability - a.durability,
      `${sign(b.durability - a.durability)} ${t('garage.stats.durability').toLowerCase()}`,
    );
    if (!out.length) out.push(el('span', { class: 'is-same', text: t('garage.noChange') }));
    return out;
  }

  #hoverPart(slot, id = null) {
    if (this.hover?.slot === slot.id && this.hover.id === id) return;
    this.hover = { slot: slot.id, id };
    this.#renderDetail();
    this.$detail.scrollTop = 0;
    this.#renderPlaques({ ...gameState.build, [slot.id]: id });
  }

  /** Поставить деталь: анимация карточки, машина «садится», пыль из-под колёс. */
  #install(slot, part, card) {
    const id = part?.id ?? null;
    const current = gameState.build[slot.id] ?? null;
    card.classList.add('is-installing');
    if (id === current) {
      if (part && (slot.required === false || slot.id === 'tires')) {
        audio.playSfx(SFX.REMOVE);
        togglePart(part.id);
      }
      return;
    }
    const wheel = slot.id === 'tires' || slot.id === 'rims';
    audio.playSfx(id ? (wheel ? SFX.WHEEL : SFX.INSTALL) : SFX.REMOVE);
    if (id) setPart(slot.id, id);
    else removePart(slot.id);
    this.#dust(slot.id);
  }

  /** Облачко пыли у колёс или под машиной после установки. */
  #dust(slotId) {
    const xs = FOCUS[slotId === 'tires' || slotId === 'rims' ? 'wheels' : 'body'] ?? [0.5];
    const w = this.car.scaleX * 288;
    for (const k of xs) {
      const x = cfg.carX - w / 2 + k * w;
      for (let i = 0; i < 6; i++) {
        const p = this.add.rectangle(x + (i - 3) * 6, cfg.groundY - 2, 3, 3, 0xcbb89a, 0.7);
        this.tweens.add({
          targets: p,
          x: p.x + (i - 3) * 8,
          y: p.y - 6 - Math.random() * 6,
          alpha: 0,
          duration: 500 + i * 40,
          onComplete: () => p.destroy(),
        });
      }
    }
  }

  // ---------- Подробности слева ----------

  #renderDetail() {
    const tile = this.view.tile;
    const group = partsData.groups.find((g) => g.id === tile);
    this.$detail.classList.remove('is-preview');
    if (!tile) return this.#renderHubDetail();
    if (!group) {
      this.$detail.hidden = false;
      const key = tile === 'looks' ? 'looks' : 'service';
      fill(
        this.$detail,
        el('div', { class: 'gdetail__eyebrow' }, [icon(tile), t(`garage.tiles.${tile}`)]),
        el('h2', { class: 'gdetail__title', text: t(`garage.${key}.title`) }),
        el('p', { class: 'gdetail__text', text: t(`garage.${key}.text`) }),
        tile === 'looks'
          ? el('p', { class: 'gdetail__note' }, [icon('info'), t('garage.looks.note')])
          : this.#conditionRow(),
      );
      return;
    }
    const slotId = this.hover?.slot ?? this.view.slot ?? group.slots[0];
    const slot = getSlot(slotId);
    const empty = { name: t('garage.empty.name'), description: t('garage.empty.description') };
    const id = this.hover ? this.hover.id : (gameState.build[slotId] ?? null);
    const part = id ? partsData.parts.find((p) => p.id === id) : null;
    const installed = (gameState.build[slotId] ?? null) === id;
    const nextBuild = { ...gameState.build, [slotId]: id };
    this.$detail.hidden = false;
    this.$detail.classList.toggle('is-preview', !installed);
    fill(
      this.$detail,
      el('div', { class: 'gdetail__eyebrow' }, [icon(slotId), slot.name]),
      el('h2', { class: 'gdetail__title', text: part?.name ?? (slot.none ?? empty).name }),
      el('p', {
        class: 'gdetail__text',
        text: (installed ? part?.description : part?.short) ?? (slot.none ?? empty).description,
      }),
      el('div', { class: 'gdetail__facts' }, this.#facts(slot, part)),
      installed ? null : el('h3', { class: 'gdetail__section', text: t('garage.ifInstall') }),
      installed ? null : el('div', { class: 'compare' }, this.#compare(nextBuild)),
      installed ? null : this.#forecastBox(gameState.build, nextBuild),
    );
  }

  /** Паспорт детали: что это за железо — одной-двумя строками фактов. */
  #facts(slot, part) {
    const f = (key, vals) => el('span', { class: 'fact', text: t(`garage.facts.${key}`, vals) });
    if (!part) return [];
    const out = [];
    if (part.grip) out.push(f('grip', { clay: part.grip.clay, asphalt: part.grip.asphalt }));
    if (part.power) {
      out.push(
        f('engine', {
          hp: part.power,
          disp: part.displacement,
          asp: part.aspiration.toLowerCase(),
          rpm: part.redline,
        }),
      );
    }
    if (part.powerMul) out.push(f('powerAdd', { pct: Math.round(part.powerMul * 100) }));
    if (part.redlineAdd) out.push(f('redlineAdd', { rpm: part.redlineAdd }));
    if (part.ratios) out.push(f('gearbox', { ms: part.shiftMs, n: part.ratios.length }));
    if (part.impact) out.push(f('impact', { k: fmt1(part.impact) }));
    if (part.downforce) out.push(f('downforce', { v: part.downforce }));
    out.push(f('mass', { kg: part.mass < 0 ? `−${Math.abs(part.mass)}` : part.mass }));
    out.push(f('durability', { d: part.durability }));
    return out;
  }

  /** Таблица «сейчас → станет» по характеристикам, которые меняются. */
  #compare(nextBuild) {
    const a = this.#stats(gameState.build);
    const b = this.#stats(nextBuild);
    const rows = [];
    for (const st of STATS) {
      const va = st.get(a) ?? 0;
      const vb = st.get(b) ?? 0;
      if (Math.abs(va - vb) < 1e-6) continue;
      const better = st.lower ? vb < va : vb > va;
      rows.push(
        el('div', { class: 'compare__row' }, [
          icon(st.icon),
          el('span', { class: 'compare__label', text: t(`garage.stats.${st.id}`) }),
          el('span', { class: 'compare__from', text: st.show(st.get(a)) }),
          el('span', { class: 'compare__arrow', text: '→' }),
          el('span', {
            class: `compare__to ${better ? 'is-up' : 'is-down'}`,
            text: st.show(st.get(b)),
          }),
        ]),
      );
    }
    if (!rows.length) rows.push(el('p', { class: 'compare__same', text: t('garage.noChange') }));
    return rows;
  }

  // ---------- Покраска ----------

  #looksPanel() {
    const group = this.view.look;
    const tabs = el(
      'div',
      { class: 'gside__tabs', role: 'tablist' },
      LOOK_GROUPS.map((g) =>
        el(
          'button',
          {
            class: `gside__tab${g === group ? ' is-active' : ''}`,
            type: 'button',
            role: 'tab',
            'aria-selected': String(g === group),
            onclick: () => {
              this.view.look = g;
              this.#render();
            },
          },
          [icon(g), t(`garage.looks.${g}`)],
        ),
      ),
    );
    const value = gameState.cosmetics[group];
    const swatches = cosmetics[group].map((c) =>
      withTip(
        el('button', {
          class: `swatch${value === c.id ? ' is-selected' : ''}${c.hex ? '' : ' is-off'}`,
          type: 'button',
          'aria-label': c.name,
          'aria-pressed': String(value === c.id),
          style: c.hex ? { background: c.hex } : {},
          onclick: () => this.#paint(group, c.id),
        }),
        c.name,
      ),
    );
    const out = [
      this.#sideHead(t('garage.tiles.looks'), t('garage.looks.note')),
      tabs,
      el('h3', { class: 'gside__section', text: t('garage.looks.presets') }),
      el('div', { class: 'swatches' }, swatches),
    ];
    if (CUSTOM_COLOR_GROUPS.includes(group)) {
      const start = cosmeticHex(group, value) ?? '#2f7bff';
      const picker = colorPicker(start, (hex) => this.#paint(group, hex, false));
      out.push(el('h3', { class: 'gside__section', text: t('garage.looks.custom') }), picker.node);
    }
    return out;
  }

  /** Перекраска: блик по кузову; из пипетки — без перерисовки панели, чтобы не сбить перетаскивание. */
  #paint(group, value, rerender = true) {
    if (!rerender) {
      gameState.cosmetics[group] = value; // тот же путь, что setCosmetic, без emit
      this.car.apply(gameState.build, gameState.cosmetics, gameState.car.dirty);
      clearTimeout(this.paintTimer);
      this.paintTimer = setTimeout(() => setCosmetic(group, value), 250);
      return;
    }
    setCosmetic(group, value);
    audio.playSfx(SFX.PAINT);
    this.car.shine?.();
  }

  // ---------- Обслуживание ----------

  #servicePanel() {
    const car = gameState.car;
    const state = {
      oil: car.oil === 'fresh',
      repair: car.damage < 0.15,
      wash: !car.dirty,
    };
    const run = { oil: changeOil, repair: repairBody, wash: washCar };
    const cards = SERVICE.map((id) => {
      const done = state[id];
      const need = t(`garage.service.${id}.need`, { pct: Math.round(car.damage * 100) });
      const $bar = el('span', { class: 'svc__progress' });
      const card = el('div', { class: `svc${done ? ' is-done' : ''}` }, [
        el('span', { class: 'svc__icon' }, [icon(id)]),
        el('span', { class: 'svc__body' }, [
          el('span', { class: 'svc__name', text: t(`garage.service.${id}.name`) }),
          el('span', {
            class: 'svc__state',
            text: done ? t(`garage.service.${id}.done`) : need,
          }),
        ]),
        done
          ? el('span', { class: 'gcard__tag' }, [icon('check'), t('garage.levels.good')])
          : webButton(
              t(`garage.service.${id}.action`),
              () => {
                card.classList.add('is-working');
                card.querySelector('.svc__state').textContent = t('garage.service.working');
                this.#serviceFx(id);
                this.time.delayedCall(SERVICE_MS, () => run[id]());
              },
              { variant: 'primary', className: 'wbtn--small svc__btn' },
            ),
        $bar,
      ]);
      return card;
    });
    return [
      this.#sideHead(t('garage.tiles.service'), t('garage.service.text')),
      el('div', { class: 'svcs' }, cards),
    ];
  }

  /** Короткая анимация на машине: капли масла, брызги воды, удары молотка. */
  #serviceFx(id) {
    audio.playSfx({ oil: SFX.OIL, repair: SFX.REPAIR, wash: SFX.WASH }[id]);
    const w = this.car.scaleX * 288;
    const left = cfg.carX - w / 2;
    if (id === 'wash') {
      for (let i = 0; i < 26; i++) {
        const x = left + Math.random() * w;
        const d = this.add.rectangle(x, cfg.groundY - 60 - Math.random() * 30, 2, 4, 0x9fd3ff, 0.8);
        this.tweens.add({
          targets: d,
          y: cfg.groundY - 4,
          alpha: 0.2,
          delay: Math.random() * 500,
          duration: 420,
          onComplete: () => d.destroy(),
        });
      }
    } else if (id === 'oil') {
      const x = left + w * 0.8;
      for (let i = 0; i < 5; i++) {
        const d = this.add.rectangle(x, cfg.groundY - 70, 3, 4, 0xd4a63a, 0.9);
        this.tweens.add({
          targets: d,
          y: cfg.groundY - 40,
          alpha: 0,
          delay: i * 150,
          duration: 380,
          onComplete: () => d.destroy(),
        });
      }
      this.car.drop(12);
    } else {
      for (let i = 0; i < 4; i++) this.time.delayedCall(i * 200, () => this.car.drop(18));
    }
  }

  // ---------- Совет деда и подсветка на машине ----------

  /**
   * Обзор гаража слева: прогноз текущего заезда, состояние машины и совет деда — он
   * появляется только когда нужен: после провала, прямой совет — после трёх подряд.
   */
  #renderHubDetail() {
    const hint = shouldShowGrandpaHint(this.testId) ? this.test.grandpaHint : null;
    const last = gameState.lastResult;
    const lastHint = last && !last.ok && last.testId === this.testId ? last.hint : null;
    const text = hint ?? lastHint;
    this.$detail.hidden = false;
    fill(
      this.$detail,
      el('div', { class: 'gdetail__eyebrow' }, [icon('finish'), this.test.name]),
      el('h2', { class: 'gdetail__title', text: t('garage.hubTitle') }),
      this.#forecastBox(gameState.build, null),
      el('h3', { class: 'gdetail__section', text: t('garage.conditionTitle') }),
      this.#conditionRow(),
      text
        ? el('div', { class: 'gnote' }, [
            el('div', { class: 'gnote__title', text: t('garage.noteTitle') }),
            el('p', { class: 'gnote__text', text }),
          ])
        : null,
    );
  }

  #launch() {
    if (!this.#stats(gameState.build).complete) return;
    // Всегда — выбор трассы на весь экран: обкатка доступна и после неё, заезд — когда открыт.
    openMapSelect(this.ui, (id) => this.goTo(id === 'race' ? SCENES.RACE : SCENES.TRIAL), {
      start: this.testId === 'race' ? 'race' : undefined,
    });
  }
}
