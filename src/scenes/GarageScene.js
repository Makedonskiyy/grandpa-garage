import Phaser from 'phaser';
import partsData from '../../data/parts.json';
import cosmetics from '../../data/cosmetics.json';
import config from '../../data/config.json';
import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, TEST_IDS, WORLD } from '../config/constants.js';
import { buildCar } from '../systems/buildCar.js';
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

    this.#drawRoom();
    const opts = { x: cfg.carX, y: cfg.groundY, dirty: gameState.car.dirty };
    this.reflection = buildCar(this, gameState.build, gameState.cosmetics, opts)
      .setScale(1, -1)
      .setAlpha(cfg.reflectionAlpha);
    this.#drawFloorFade();
    this.car = buildCar(this, gameState.build, gameState.cosmetics, opts);
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
    this.reflection.syncFrom(this.car);
  }

  async #playGarageIntro() {
    gameState.flags.garageIntroSeen = true;
    this.ui.style.visibility = 'hidden';
    await new DialogSystem(this).play('garageIntro');
    this.ui.style.visibility = '';
  }

  // ---------- Комната: стена, лампа, пол ----------

  #drawRoom() {
    const { width, height } = WORLD;
    const floor = cfg.groundY;
    const g = this.add.graphics();
    // Стена: тёмные доски, к потолку темнее (ступенями — пиксельно).
    const wall = [0x15130f, 0x1a1713, 0x1f1b16, 0x231f19];
    wall.forEach((c, i) =>
      g.fillStyle(c).fillRect(0, (floor * i) / wall.length, width, floor / wall.length + 1),
    );
    for (let x = 0; x < width; x += 32) g.fillStyle(0x000000, 0.18).fillRect(x, 0, 1, floor);
    // Плинтус и пол.
    g.fillStyle(0x0e0c0a).fillRect(0, floor - 2, width, 3);
    g.fillStyle(0x2a2622).fillRect(0, floor + 1, width, height - floor);
    for (let y = floor + 8; y < height; y += 14)
      g.fillStyle(0x000000, 0.12).fillRect(0, y, width, 1);

    // Лампа над машиной и свет на неё — ступенчатые слои с режимом ADD.
    const x = cfg.carX;
    g.fillStyle(0x0b0a08).fillRect(x - 1, 0, 2, 26);
    g.fillStyle(0x3a352e).fillRect(x - 10, 26, 20, 5);
    g.fillStyle(0xffe2a8).fillRect(x - 4, 31, 8, 3);
    const light = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    [
      [200, 0.035],
      [160, 0.04],
      [120, 0.05],
    ].forEach(([w, a]) =>
      light
        .fillStyle(0xffd9a0, a)
        .fillTriangle(x - 10, 32, x + 10, 32, x + w, floor)
        .fillTriangle(x - 10, 32, x - w, floor, x + w, floor),
    );
    [
      [320, 22, 0.06],
      [240, 16, 0.07],
      [150, 10, 0.08],
    ].forEach(([w, h, a]) => light.fillStyle(0xffd9a0, a).fillEllipse(x, floor + 4, w, h));
  }

  /** Пол гасит отражение книзу. */
  #drawFloorFade() {
    const { width, height } = WORLD;
    const g = this.add.graphics();
    const c = 0x2a2622;
    g.fillGradientStyle(c, c, c, c, 0, 0, 1, 1);
    g.fillRect(0, cfg.groundY + 1, width, height - cfg.groundY);
  }

  // ---------- HTML-интерфейс ----------

  #buildUI() {
    const n = TEST_IDS.indexOf(this.testId) + 1;
    this.$stats = el('div', { class: 'gstats' });
    this.$verdict = el('div', { class: 'gverdict' });
    this.$note = el('div', { class: 'gnote__text' });
    this.$tray = el('div', { class: 'ui-abs gtray' });
    this.$tabs = el('div', { class: 'ui-abs gtabs', role: 'tablist' });
    this.$missing = el('div', { class: 'glaunch__missing' });
    this.$launch = webButton(this.test.startButton, () => this.#launch(), {
      variant: 'primary',
      icon: 'play',
      className: 'glaunch__btn',
    });

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
      el('aside', { class: 'ui-abs gside' }, [
        el('section', { class: 'gpanel' }, [this.$stats, this.$verdict]),
        el('section', { class: 'gnote' }, [
          el('div', { class: 'gnote__title', text: t('garage.noteTitle') }),
          this.$note,
        ]),
      ]),
      this.$tray,
      this.$tabs,
      el('div', { class: 'ui-abs glaunch' }, [this.$missing, this.$launch]),
    );
  }

  #render() {
    // В create() сцена ещё не «активна» по мнению Phaser, поэтому свой флаг жизни.
    if (!this.alive) return;
    const buildKey = JSON.stringify(gameState.build);
    for (const rig of [this.car, this.reflection]) {
      rig.apply(gameState.build, gameState.cosmetics, gameState.car.dirty);
    }
    if (buildKey !== this.lastBuild) this.car.drop();
    this.lastBuild = buildKey;

    this.#renderStats();
    this.#renderTabs();
    this.#renderTray();
    this.#renderLaunch();
    this.#renderNote();
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
        // Стоящая деталь — короткое описание, остальные — что изменится, если поставить.
        selected
          ? el('div', { class: 'gcard__desc', text: desc })
          : el('div', { class: 'gcard__delta' }, this.#deltas(nextBuild)),
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
    this.$missing.textContent = missing.length
      ? t('garage.missing', {
          slots: missing.map((s) => t(`garage.tabs.${s}`).toLowerCase()).join(', '),
        })
      : '';
  }

  #renderNote() {
    const hint = shouldShowGrandpaHint(this.testId) ? this.test.grandpaHint : null;
    const last = gameState.lastResult;
    const lastHint = last && !last.ok && last.testId === this.testId ? last.hint : null;
    this.$note.textContent = hint ?? lastHint ?? t('garage.noteDefault');
  }

  #launch() {
    if (!computeStats(gameState.build).complete) return;
    this.goTo(this.test.scene);
  }
}
