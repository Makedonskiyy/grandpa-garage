/**
 * Выбор карты обкатки (окно из гаража): три карточки — грунтовка, автодром ДОСААФ
 * и бесконечная объездная. Первые две засчитывают обкатку, объездная — практика.
 * На карточке — что проверяет трасса и прогноз идеального водителя для текущей сборки.
 */
import { el } from './dom.js';
import { icon } from './icons.js';
import { openModal } from './overlay.js';
import { webButton } from './components.js';
import { t } from '../systems/strings.js';
import { getTest } from '../systems/simulate.js';
import { predict } from '../systems/drive.js';
import { gameState } from '../gameState.js';

export const TRIAL_MAPS = ['trial', 'trial_track', 'trial_free'];
const ART = { mud: 'is-mud', track: 'is-track', free: 'is-free' };

/** @param {(mapId: string) => void} onPick */
export function openMapSelect(onPick) {
  return openModal(
    (close) => [
      el(
        'div',
        { class: 'maps' },
        TRIAL_MAPS.map((id) => {
          const test = getTest(id);
          let verdict = null;
          if (!test.practice) {
            const r = predict(id, gameState.build, gameState.car);
            verdict = el('p', { class: `map__verdict ${r.ok ? 'is-ok' : 'is-bad'}` }, [
              icon(r.ok ? 'check' : 'warning'),
              r.ok ? t('maps.canPass') : (r.reason ?? t('maps.cannot')),
            ]);
          }
          return el('article', { class: `map ${ART[test.mode]}` }, [
            el('div', { class: 'map__art', 'aria-hidden': 'true' }),
            el('span', {
              class: `map__tag${test.practice ? ' is-practice' : ''}`,
              text: test.practice ? t('maps.practice') : t('maps.counts'),
            }),
            el('h3', { class: 'map__name', text: test.map.name }),
            el('p', { class: 'map__short', text: test.map.short }),
            el('p', { class: 'map__goal', text: test.goal }),
            verdict,
            webButton(
              test.practice ? t('maps.free') : t('maps.go'),
              () => {
                close();
                gameState.trialMap = id;
                onPick(id);
              },
              { variant: test.practice ? 'dark' : 'primary', icon: 'play', className: 'map__go' },
            ),
          ]);
        }),
      ),
    ],
    { id: 'maps', title: t('maps.title'), size: 'lg' },
  );
}
