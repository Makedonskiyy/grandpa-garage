import { el } from './dom.js';
import { icon } from './icons.js';
import { openModal } from './overlay.js';
import { t, tList } from '../systems/strings.js';

/**
 * Окно «Как играть» (ТЗ 3.3): слева — путь к заезду по шагам, справа — управление
 * клавишами и что значат характеристики машины в гараже.
 */
export function openHowTo() {
  return openModal(
    () => {
      const steps = tList('howTo.steps').map((s, i) =>
        el('li', { class: 'howto__step' }, [
          el('span', { class: 'howto__num', text: String(i + 1) }),
          el('div', {}, [
            el('div', { class: 'howto__step-title', text: s.title }),
            el('p', { class: 'howto__step-text', text: s.text }),
          ]),
        ]),
      );
      const controls = tList('howTo.controls').map((c) =>
        el('div', { class: 'howto__row' }, [
          el(
            'span',
            { class: 'howto__keys' },
            c.keys.map((k) =>
              k === 'Мышь'
                ? el('kbd', { class: 'kbd--icon' }, [icon('mouse')])
                : el('kbd', { text: k }),
            ),
          ),
          el('span', { class: 'howto__row-text', text: c.text }),
        ]),
      );
      const stats = tList('howTo.stats').map((s) =>
        el('div', { class: 'howto__row' }, [
          el('span', { class: 'howto__stat', text: s.name }),
          el('span', { class: 'howto__row-text', text: s.text }),
        ]),
      );
      return [
        el('div', { class: 'howto' }, [
          el('section', {}, [
            el('h3', { class: 'modal__section', text: t('howTo.stepsTitle') }),
            el('ol', { class: 'howto__steps' }, steps),
            el('h3', { class: 'modal__section howto__tips-title', text: t('howTo.tipsTitle') }),
            el(
              'ul',
              { class: 'howto__tips' },
              tList('howTo.tips').map((tip) => el('li', { text: tip })),
            ),
          ]),
          el('div', { class: 'howto__side' }, [
            el('section', {}, [
              el('h3', { class: 'modal__section', text: t('howTo.controlsTitle') }),
              ...controls,
            ]),
            el('section', {}, [
              el('h3', { class: 'modal__section', text: t('howTo.statsTitle') }),
              ...stats,
              el('p', { class: 'howto__note', text: t('howTo.looksNote') }),
            ]),
          ]),
        ]),
      ];
    },
    { id: 'howto', title: t('howTo.title'), size: 'lg' },
  );
}
