import { webButton } from './components.js';
import { el } from './dom.js';
import { icon } from './icons.js';
import { openModal } from './overlay.js';
import { t, tList } from '../systems/strings.js';

const STEP_ICONS = ['service', 'speed', 'finish'];

export function openGarageGuide() {
  openModal(
    (close) => [
      el(
        'ol',
        { class: 'garage-guide' },
        tList('garageGuide.steps').map(({ title, text }, index) =>
          el('li', { class: 'garage-guide__step' }, [
            icon(STEP_ICONS[index]),
            el('div', {}, [el('h3', { text: title }), el('p', { text })]),
          ]),
        ),
      ),
      el('div', { class: 'garage-guide__actions' }, [
        webButton(t('garageGuide.start'), close, { variant: 'primary', icon: 'garage' }),
      ]),
    ],
    { id: 'garage-guide', title: t('garageGuide.title') },
  );
}
