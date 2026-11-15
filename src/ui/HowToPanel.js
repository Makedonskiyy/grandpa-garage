import { el } from './dom.js';
import { button } from './components.js';
import { openModal } from './overlay.js';
import { t, tList } from '../systems/strings.js';

/** Окно «Как играть»: цель, управление, как проходить (ТЗ 3.3). */
export function openHowTo() {
  return openModal(
    (close) => [
      el('h2', { text: t('howTo.title') }),
      ...tList('howTo.lines').map((line) => el('p', { text: line })),
      el('div', { class: 'modal__footer' }, button(t('howTo.close'), close)),
    ],
    { id: 'howto' },
  );
}
