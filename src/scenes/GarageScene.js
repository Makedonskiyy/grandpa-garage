import Phaser from 'phaser';
import partsData from '../../data/parts.json';
import cosmetics from '../../data/cosmetics.json';
import { BaseScene } from './BaseScene.js';
import { SCENES, MUSIC, FONT_FAMILY, TEST_IDS } from '../config/constants.js';
import { drawGarageInterior, FLOOR_Y } from './garageBackdrop.js';
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
  setCosmetic,
  shouldShowGrandpaHint,
} from '../gameState.js';
import { el, clear } from '../ui/dom.js';
import { button } from '../ui/components.js';
import { openSettings } from '../ui/SettingsPanel.js';
import { openHowTo } from '../ui/HowToPanel.js';
import { t } from '../systems/strings.js';

const CAR_X = 300;
const CAR_Y = FLOOR_Y - 6;
const LOOK_GROUPS = ['paint', 'rim', 'headlight', 'neon'];

/**
 * Гараж (ТЗ 3.6): машина в центре, слоты с подписями, панель характеристик справа,
 * вкладки деталей снизу, записка деда, кнопка запуска. Пересчёт — в том же кадре.
 */
export class GarageScene extends BaseScene {
  constructor() {
    super(SCENES.GARAGE);
  }

  create() {
    this.enter();
    audio.playMusic(MUSIC.GARAGE);
    drawGarageInterior(this);

    this.testId = getCurrentTestId();
    this.test = getTest(this.testId);
    this.activeTab = this.activeTab ?? 'wheels';
    this.car = null;
    this.slotLabels = this.#createSlotLabels();

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

  async #playGarageIntro() {
    gameState.flags.garageIntroSeen = true;
    this.ui.style.visibility = 'hidden';
    await new DialogSystem(this).play('garageIntro');
    this.ui.style.visibility = '';
  }

  // ---------- Phaser: машина и подписи слотов ----------

  #createSlotLabels() {
    const style = { fontFamily: FONT_FAMILY, fontSize: '6px', color: '#e8d9b0' };
    const g = this.add.graphics().lineStyle(1, 0xe8d9b0, 0.6);
    // Линии-подписи от деталей машины к названиям слотов.
    g.lineBetween(CAR_X + 68, CAR_Y - 6, CAR_X + 104, CAR_Y - 6);
    g.lineBetween(CAR_X + 70, CAR_Y - 36, CAR_X + 40, CAR_Y - 104);
    g.lineBetween(CAR_X - 30, CAR_Y - 62, CAR_X - 60, CAR_Y - 104);
    return {
      wheels: this.add.text(CAR_X + 108, CAR_Y - 9, '', style),
      engine: this.add.text(CAR_X + 10, CAR_Y - 114, '', style),
      body: this.add.text(CAR_X - 150, CAR_Y - 114, '', style),
    };
  }

  #renderCar() {
    this.car?.destroy();
    this.car = buildCar(this, gameState.build, gameState.cosmetics, { x: CAR_X, y: CAR_Y });
    for (const slot of partsData.slots) {
      const part = computeStats(gameState.build).parts[slot.id];
      this.slotLabels[slot.id].setText(`${slot.name}: ${part ? part.name : '—'}`);
    }
  }

  // ---------- HTML-интерфейс ----------

  #buildUI() {
    const n = TEST_IDS.indexOf(this.testId) + 1;
    this.$stats = el('div', { class: 'ui-abs panel stats' });
    this.$tabs = el('div', { class: 'tabs' });
    this.$cards = el('div', { class: 'cards' });
    this.$missing = el('div', { class: 'launch__missing' });
    this.$launch = button(this.test.startButton, () => this.#launch(), { variant: 'primary' });
    this.$note = el('div', { class: 'ui-abs note' });

    this.ui.append(
      el('div', { class: 'ui-abs topbar' }, [
        el('div', { class: 'panel topbar__goal' }, [
          el('span', { class: 'accent', text: `${this.test.name}. ` }),
          this.test.goal,
        ]),
        el('div', { class: 'panel', text: t('garage.testCounter', { n, total: TEST_IDS.length }) }),
        button('?', () => openHowTo(), { variant: 'icon' }),
        button('⚙', () => openSettings(), { variant: 'icon' }),
      ]),
      this.$stats,
      this.$note,
      el('div', { class: 'ui-abs bottom' }, [
        el('div', { class: 'panel' }, [this.$tabs, this.$cards]),
        el('div', { class: 'panel launch' }, [this.$missing, this.$launch]),
      ]),
    );
  }

  #render() {
    // В create() сцена ещё не «активна» по мнению Phaser, поэтому свой флаг жизни.
    if (!this.alive) return;
    this.#renderCar();
    this.#renderStats();
    this.#renderTabs();
    this.#renderCards();
    this.#renderLaunch();
    this.#renderNote();
  }

  #renderStats() {
    const stats = computeStats(gameState.build);
    const r = evaluate(this.testId, gameState.build);
    const row = (label, value) =>
      el('div', { class: 'stats__row' }, [el('span', { class: 'muted', text: label }), value]);

    // «Нужно / Есть»: тяга против сопротивления грязи на обкатке, время против Палыча в заезде.
    const need = [];
    if (r.details) {
      const sec = t('garage.units.sec');
      const [needText, haveText] =
        this.testId === 'trial'
          ? [String(Math.round(r.details.need)), String(Math.round(r.details.force))]
          : [
              `< ${formatSeconds(this.test.rivalTime)} ${sec}`,
              `${formatSeconds(r.details.time)} ${sec}`,
            ];
      const ok =
        this.testId === 'trial'
          ? r.details.force >= r.details.need
          : r.details.time < this.test.rivalTime;
      need.push(
        row(t('garage.stats.need'), needText),
        row(t('garage.stats.have'), el('span', { class: ok ? 'ok' : 'bad', text: haveText })),
      );
    }
    need.push(
      row(
        `${t('garage.stats.durability')} ≥ ${this.test.minDurability}`,
        el('span', {
          class: stats.durability >= this.test.minDurability ? 'ok' : 'bad',
          text: String(stats.durability),
        }),
      ),
    );

    clear(this.$stats).append(
      row(t('garage.stats.power'), `${stats.display.hp} ${t('garage.units.hp')}`),
      row(t('garage.stats.mass'), `${stats.display.kg} ${t('garage.units.kg')}`),
      row(
        t('garage.stats.grip', { surface: this.test.surfaceName }),
        String(stats.grip[this.test.surface]),
      ),
      row(t('garage.stats.durability'), String(stats.durability)),
      el('div', { class: 'stats__need' }, need),
    );
  }

  #renderTabs() {
    const ids = [...partsData.slots.map((s) => s.id), 'looks'];
    clear(this.$tabs).append(
      ...ids.map((id) =>
        el('button', {
          class: `tab${id === this.activeTab ? ' tab--active' : ''}`,
          type: 'button',
          text: t(`garage.tabs.${id}`),
          onclick: () => {
            this.activeTab = id;
            this.#render();
          },
        }),
      ),
    );
  }

  #massLabel(mass) {
    const { light, heavy } = partsData.units.massBars;
    if (mass <= light) return t('garage.massBars.light');
    if (mass >= heavy) return t('garage.massBars.heavy');
    return t('garage.massBars.medium');
  }

  #renderCards() {
    clear(this.$cards);
    if (this.activeTab === 'looks') {
      this.$cards.append(...LOOK_GROUPS.map((g) => this.#swatchGroup(g)));
      return;
    }
    for (const part of getPartsBySlot(this.activeTab)) {
      const selected = gameState.build[part.slot] === part.id;
      const props = [`${t('garage.stats.mass')}: ${this.#massLabel(part.mass)}`];
      if (part.power) props.push(`${part.power * partsData.units.hpPerPowerPoint} л.с.`);
      if (part.grip) props.push(`грунт ${part.grip.clay} · асфальт ${part.grip.asphalt}`);
      props.push(`${t('garage.stats.durability')}: ${part.durability}`);
      this.$cards.append(
        el(
          'button',
          {
            class: `card${selected ? ' card--selected' : ''}`,
            type: 'button',
            onclick: () => togglePart(part.id),
          },
          [
            el('div', { class: 'card__name', text: part.name }),
            ...props.map((p) => el('div', { text: p })),
          ],
        ),
      );
    }
  }

  #swatchGroup(group) {
    return el('div', { class: 'card' }, [
      el('div', { class: 'card__name', text: t(`garage.looks.${group}`) }),
      el(
        'div',
        {},
        cosmetics[group].map((c) =>
          el('button', {
            class: `swatch${gameState.cosmetics[group] === c.id ? ' swatch--selected' : ''}`,
            type: 'button',
            title: c.name,
            style: {
              background: c.hex ?? 'repeating-linear-gradient(45deg,#222 0 2px,#444 2px 4px)',
            },
            onclick: () => setCosmetic(group, c.id),
          }),
        ),
      ),
    ]);
  }

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
