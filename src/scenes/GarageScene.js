import Phaser from 'phaser';
import partsData from '../../data/parts.json';
import cosmetics from '../../data/cosmetics.json';
import config from '../../data/config.json';
import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, TEST_IDS } from '../config/constants.js';
import { drawGarageRoom, placeGarageCar } from './garageBackdrop.js';
import { DialogSystem } from '../systems/DialogSystem.js';
import { audio } from '../systems/AudioManager.js';
import {
  computeStats,
  evaluate,
  formatSeconds,
  getPartsBySlot,
  getTest,
} from '../systems/simulate.js';
import {
  gameState,
  getCurrentTestId,
  onStateChange,
  togglePart,
  removePart,
  setCosmetic,
  washCar,
  shouldShowGrandpaHint,
} from '../gameState.js';
import { el, clear } from '../ui/dom.js';
import { webButton } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { openSettings } from '../ui/SettingsPanel.js';
import { openHowTo } from '../ui/HowToPanel.js';
import { t } from '../systems/strings.js';

const cfg = config.garage;
const LOOK_GROUPS = ['paint', 'rim', 'headlight', 'neon'];
const TABS = [...partsData.slots.map((s) => s.id), 'looks'];
const { hpPerPowerPoint: HP, kgPerMassPoint: KG } = partsData.units;

/**
 * Гараж — тюнинг (ТЗ 3.6). Машина под лампой на глянцевом полу — единственное яркое место;
 * интерфейс тихий: характеристики слева, записка деда, детали и вкладки снизу, запуск справа.
 * Наведение на карточку показывает, как деталь изменит характеристики, клик ставит или снимает.
 */
export class GarageScene extends BaseScene {
  constructor() {
    super(SCENES.GARAGE);
  }

  create() {
    this.enter();
    audio.playMusic(MUSIC.GARAGE);

    this.testId = getCurrentTestId();
    this.test = getTest(this.testId);
    this.activeTab = this.activeTab ?? 'wheels';
    this.preview = null; // сборка «если поставить» при наведении на карточку

    drawGarageRoom(this, { lampX: cfg.carX, groundY: cfg.groundY });
    ({ car: this.car } = placeGarageCar(this, {
      x: cfg.carX,
      groundY: cfg.groundY,
      scale: cfg.carScale,
    }));
    this.lastBuild = JSON.stringify(gameState.build);

    this.alive = true;
    this.#buildUI();
    this.#render();

    const off = onStateChange(() => this.#render());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.alive = false;
      off();
    });

    if (!gameState.flags.garageIntroSeen) this.#playGarageIntro();
  }

  update(_time, delta) {
    this.car.step(delta / 1000);
  }

  async #playGarageIntro() {
    gameState.flags.garageIntroSeen = true;
    this.ui.style.visibility = 'hidden';
    await new DialogSystem(this).play('garageIntro');
    this.ui.style.visibility = '';
  }

  // ---------- HTML-интерфейс ----------

  #buildUI() {
    const n = TEST_IDS.indexOf(this.testId) + 1;
    this.$stats = el('div', { class: 'gstats' });
    this.$verdict = el('div', { class: 'gverdict' });
    this.$adviceText = el('div', { class: 'gadvice__text' });
    this.$advice = el('section', { class: 'gadvice', hidden: true }, [
      el('div', { class: 'gadvice__title', text: t('garage.noteTitle') }),
      this.$adviceText,
    ]);
    this.$tray = el('div', { class: 'ui-abs gtray' });
    this.$tabs = el('div', { class: 'ui-abs gtabs', role: 'tablist' });
    this.$launch = webButton(this.test.startButton, () => this.#launch(), {
      variant: 'primary',
      icon: 'play',
      className: 'glaunch__btn',
    });
    // Вторая строка на кнопке: чего не хватает для запуска.
    this.$launchSub = el('span', { class: 'glaunch__sub' });
    this.$launch.querySelector('.wbtn__label').append(this.$launchSub);

    this.ui.append(
      el('header', { class: 'ui-abs gtop' }, [
        el('div', { class: 'gtop__goal' }, [
          el('div', {
            class: 'gtop__chip',
            text: t('garage.testChip', { name: this.test.name, n, total: TEST_IDS.length }),
          }),
          el('div', { class: 'gtop__text', text: this.test.goal }),
        ]),
        el('div', { class: 'gtop__actions' }, [
          webButton('', () => openHowTo(), {
            icon: 'help',
            className: 'wbtn--icon',
            title: t('menu.howTo'),
          }),
          webButton('', () => openSettings(), {
            icon: 'gear',
            className: 'wbtn--icon',
            title: t('menu.settings'),
          }),
        ]),
      ]),
      el('aside', { class: 'ui-abs gpanel gside' }, [this.$stats, this.$verdict, this.$advice]),
      this.$tray,
      this.$tabs,
      el('div', { class: 'ui-abs glaunch' }, this.$launch),
    );
  }

  #render() {
    // В create() сцена ещё не «активна» по мнению Phaser, поэтому свой флаг жизни.
    if (!this.alive) return;
    const buildKey = JSON.stringify(gameState.build);
    this.car.apply(gameState.build, gameState.cosmetics, gameState.car.dirty);
    if (buildKey !== this.lastBuild) this.car.drop();
    this.lastBuild = buildKey;

    this.#renderStats();
    this.#renderTabs();
    this.#renderTray();
    this.#renderLaunch();
    this.#renderAdvice();
  }

  // ---------- Характеристики ----------

  #renderStats() {
    const now = computeStats(gameState.build);
    const next = this.preview ? computeStats(this.preview) : null;
    const surface = this.test.surface;
    const max = cfg.statMax;

    const rows = [
      {
        label: t('garage.stats.power'),
        value: (s) => s.power,
        show: (s) => `${s.power * HP} ${t('garage.units.hp')}`,
        max: max.power,
      },
      {
        label: t('garage.stats.mass'),
        value: (s) => s.mass,
        show: (s) => `${s.mass * KG} ${t('garage.units.kg')}`,
        max: max.mass,
        lowerIsBetter: true,
      },
      {
        label: t('garage.stats.grip', { surface: this.test.surfaceName }),
        value: (s) => s.grip[surface],
        show: (s) => String(s.grip[surface]),
        max: max.grip,
      },
      {
        label: t('garage.stats.downforce'),
        value: (s) => s.downforce,
        show: (s) => String(s.downforce),
        max: max.downforce,
      },
      {
        label: t('garage.stats.durability'),
        value: (s) => s.durability,
        show: (s) => String(s.durability),
        max: max.durability,
      },
    ];

    clear(this.$stats).append(
      ...rows.map((r) => {
        const v = r.value(now);
        const nv = next ? r.value(next) : v;
        const diff = nv - v;
        const better = r.lowerIsBetter ? diff < 0 : diff > 0;
        return el('div', { class: 'gstat' }, [
          el('div', { class: 'gstat__head' }, [
            el('span', { class: 'gstat__label', text: r.label }),
            el('span', {
              class: `gstat__value${diff ? (better ? ' is-up' : ' is-down') : ''}`,
              text: r.show(next ?? now),
            }),
          ]),
          this.#bar(v, nv, r.max, better),
        ]);
      }),
    );

    this.#renderVerdict(next ? this.preview : gameState.build);
  }

  /** Сегментная полоса: текущее значение и, при наведении, прибавка или убыль. */
  #bar(value, next, max, better) {
    const n = cfg.barSegments;
    const a = Math.round((Math.min(value, max) / max) * n);
    const b = Math.round((Math.min(next, max) / max) * n);
    const segs = [];
    for (let i = 0; i < n; i++) {
      let cls = 'gbar__seg';
      if (i < Math.min(a, b)) cls += ' is-on';
      else if (i < Math.max(a, b))
        cls += `${better ? ' is-up' : ' is-down'}${b < a ? ' is-removed' : ''}`;
      segs.push(el('span', { class: cls }));
    }
    return el('div', { class: 'gbar' }, segs);
  }

  #renderVerdict(build) {
    const r = evaluate(this.testId, build);
    const stats = computeStats(build);
    const v = (label, value, ok) =>
      el('div', { class: 'gverdict__row' }, [
        el('span', { text: label }),
        el('span', { class: ok === null ? '' : ok ? 'is-ok' : 'is-bad', text: value }),
      ]);
    const rows = [];
    if (!r.details) {
      rows.push(el('div', { class: 'gverdict__empty', text: t('garage.missingWheels') }));
    } else if (this.testId === 'trial') {
      const ok = r.details.force >= r.details.need;
      rows.push(v(t('garage.verdict.trialNeed'), String(Math.round(r.details.need)), null));
      rows.push(v(t('garage.verdict.trialHave'), String(Math.round(r.details.force)), ok));
    } else {
      const sec = t('garage.units.sec');
      rows.push(
        v(t('garage.verdict.raceNeed'), `${formatSeconds(this.test.rivalTime)} ${sec}`, null),
      );
      rows.push(
        v(
          t('garage.verdict.raceHave'),
          `${formatSeconds(r.details.time)} ${sec}`,
          r.details.time < this.test.rivalTime,
        ),
      );
    }
    if (r.details) {
      rows.push(
        v(
          t('garage.verdict.durabilityNeed', { min: this.test.minDurability }),
          String(stats.durability),
          stats.durability >= this.test.minDurability,
        ),
      );
    }
    clear(this.$verdict).append(...rows);
  }

  // ---------- Вкладки и детали ----------

  #renderTabs() {
    clear(this.$tabs).append(
      ...TABS.map((id) =>
        el(
          'button',
          {
            class: `gtab${id === this.activeTab ? ' is-active' : ''}`,
            type: 'button',
            role: 'tab',
            'aria-selected': String(id === this.activeTab),
            onclick: () => {
              this.activeTab = id;
              this.preview = null;
              this.#render();
            },
          },
          [icon(id), el('span', { class: 'gtab__label', text: t(`garage.tabs.${id}`) })],
        ),
      ),
    );
  }

  #renderTray() {
    clear(this.$tray);
    if (this.activeTab === 'looks') {
      this.$tray.classList.add('is-looks');
      this.$tray.append(...LOOK_GROUPS.map((g) => this.#swatches(g)));
      if (gameState.car.dirty) {
        this.$tray.append(
          webButton(t('garage.wash'), () => washCar(), {
            icon: 'wash',
            className: 'wbtn--small gwash',
          }),
        );
      }
      return;
    }
    this.$tray.classList.remove('is-looks');
    const slot = this.activeTab;
    const options = getPartsBySlot(slot).map((p) => this.#partCard(p));
    if (slot === 'spoiler') options.unshift(this.#noneCard(slot));
    this.$tray.append(...options);
  }

  #withPart(slot, id) {
    return { ...gameState.build, [slot]: id };
  }

  /** Краткий итог «что изменится»: только то, что меняется, со знаком. */
  #deltas(nextBuild) {
    const a = computeStats(gameState.build);
    const b = computeStats(nextBuild);
    const surface = this.test.surface;
    const out = [];
    const push = (diff, text, lowerIsBetter = false) => {
      if (!diff) return;
      const good = lowerIsBetter ? diff < 0 : diff > 0;
      out.push(el('span', { class: good ? 'is-up' : 'is-down', text }));
    };
    const sign = (n) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
    push(b.power - a.power, `${sign((b.power - a.power) * HP)} ${t('garage.units.hp')}`);
    push(b.mass - a.mass, `${sign((b.mass - a.mass) * KG)} ${t('garage.units.kg')}`, true);
    push(b.grip[surface] - a.grip[surface], `${sign(b.grip[surface] - a.grip[surface])} сцеп.`);
    push(b.downforce - a.downforce, `${sign(b.downforce - a.downforce)} прижим`);
    push(b.durability - a.durability, `${sign(b.durability - a.durability)} прочн.`);
    if (!out.length) out.push(el('span', { class: 'is-same', text: t('garage.deltaNone') }));
    return out;
  }

  #card({ selected, name, desc, nextBuild, onClick }) {
    const card = el(
      'button',
      {
        class: `gcard${selected ? ' is-selected' : ''}`,
        type: 'button',
        title: desc,
        'aria-pressed': String(selected),
        onclick: onClick,
        onpointerenter: () => {
          this.preview = nextBuild;
          this.#renderStats();
        },
        onpointerleave: () => {
          this.preview = null;
          this.#renderStats();
        },
      },
      [
        el('div', { class: 'gcard__head' }, [
          el('span', { class: 'gcard__name', text: name }),
          selected
            ? el('span', { class: 'gcard__tag' }, [icon('check'), t('garage.installed')])
            : null,
        ]),
        el('div', { class: 'gcard__desc', text: desc }),
        el('div', { class: 'gcard__delta' }, selected ? [] : this.#deltas(nextBuild)),
      ],
    );
    return card;
  }

  #partCard(part) {
    const selected = gameState.build[part.slot] === part.id;
    return this.#card({
      selected,
      name: part.name,
      desc: part.description,
      nextBuild: this.#withPart(part.slot, selected ? null : part.id),
      onClick: () => {
        this.preview = null;
        togglePart(part.id);
      },
    });
  }

  #noneCard(slot) {
    const selected = !gameState.build[slot];
    return this.#card({
      selected,
      name: t('garage.noSpoiler'),
      desc: 'Легче, но на асфальте зад не прижат.',
      nextBuild: this.#withPart(slot, null),
      onClick: () => {
        this.preview = null;
        removePart(slot);
      },
    });
  }

  #swatches(group) {
    return el('div', { class: 'gswatches' }, [
      el('div', { class: 'gswatches__label', text: t(`garage.looks.${group}`) }),
      el(
        'div',
        { class: 'gswatches__row' },
        cosmetics[group].map((c) =>
          el('button', {
            class: `gswatch${gameState.cosmetics[group] === c.id ? ' is-selected' : ''}${c.hex ? '' : ' is-off'}`,
            type: 'button',
            title: c.name,
            'aria-label': c.name,
            style: c.hex ? { background: c.hex } : {},
            onclick: () => setCosmetic(group, c.id),
          }),
        ),
      ),
    ]);
  }

  // ---------- Запуск и записка ----------

  #renderLaunch() {
    const { missing } = computeStats(gameState.build);
    this.$launch.disabled = missing.length > 0;
    this.$launchSub.textContent = missing.length
      ? t('garage.missing', {
          slots: missing.map((s) => t(`garage.tabs.${s}`).toLowerCase()).join(', '),
        })
      : '';
  }

  /** Совет деда — только когда он нужен: после провала, прямой совет — после трёх подряд (ТЗ 4.5). */
  #renderAdvice() {
    const hint = shouldShowGrandpaHint(this.testId) ? this.test.grandpaHint : null;
    const last = gameState.lastResult;
    const lastHint = last && !last.ok && last.testId === this.testId ? last.hint : null;
    const text = hint ?? lastHint;
    this.$advice.hidden = !text;
    this.$adviceText.textContent = text ?? '';
  }

  #launch() {
    if (!computeStats(gameState.build).complete) return;
    this.goTo(this.test.scene);
  }
}
