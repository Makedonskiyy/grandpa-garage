import { webButton } from './components.js';
import { el } from './dom.js';
import { openModal } from './overlay.js';
import { t, tList } from '../systems/strings.js';

export function openGarageGuide() {
  openModal(
    (close) => [
      el(
        'ol',
        { class: 'garage-guide' },
        tList('garageGuide.steps').map(({ title, text }) =>
          el('li', { class: 'garage-guide__step' }, [el('h3', { text: title }), el('p', { text })]),
        ),
      ),
      el('div', { class: 'garage-guide__actions' }, [
        webButton(t('garageGuide.start'), close, { variant: 'primary' }),
      ]),
    ],
    { id: 'garage-guide', title: t('story.noteFrom') },
  );
}
