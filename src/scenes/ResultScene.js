import { BaseScene } from './BaseScene.js';
import { SCENES, SFX } from '../config/constants.js';
import { DialogSystem } from '../systems/DialogSystem.js';
import { audio } from '../systems/AudioManager.js';
import { formatSeconds, getTest } from '../systems/simulate.js';
import { gameState } from '../gameState.js';
import { el } from '../ui/dom.js';
import { button } from '../ui/components.js';
import { t } from '../systems/strings.js';

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
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x0e0d12).setOrigin(0);

    const r = gameState.lastResult;
    if (!r) {
      this.goTo(SCENES.MENU);
      return;
    }
    const test = getTest(r.testId);

    // Поражение в заезде: сначала реплика Палыча (20), потом экран результата.
    if (!r.ok && r.testId === 'race') await new DialogSystem(this).play('raceLose');

    const lines = [];
    if (r.testId === 'race') {
      lines.push(`${t('result.time')}: ${formatSeconds(r.details.time)} ${t('garage.units.sec')}`);
      lines.push(r.details.diffText);
    }
    lines.push(`${t('result.durabilityLeft')}: ${r.stats.durability} (≥ ${test.minDurability})`);

    const next = r.ok ? (r.testId === 'trial' ? SCENES.PALYCH : SCENES.ENDING) : SCENES.GARAGE;
    this.ui.append(
      el('div', { class: 'ui-abs panel result' }, [
        el('div', { class: 'muted', text: test.name }),
        el('h1', {
          class: r.ok ? 'ok' : 'bad',
          text: r.ok ? t('result.success') : t('result.fail'),
        }),
        r.reason ? el('p', { text: r.reason }) : null,
        ...lines.map((l) => el('p', { class: 'muted', text: l })),
        r.hint ? el('p', { class: 'accent', text: r.hint }) : null,
        el('div', { class: 'result__actions' }, [
          button(t('result.toMenu'), () => this.goTo(SCENES.MENU)),
          button(r.ok ? t('result.next') : t('result.rebuild'), () => this.goTo(next), {
            variant: 'primary',
          }),
        ]),
      ]),
    );
    audio.playSfx(r.ok ? SFX.SUCCESS : SFX.FAIL);
  }
}
