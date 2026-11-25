/**
 * Выбор трассы на весь экран: карточки листаются стрелками, колесом, свайпом и клавишами
 * ← →, Enter — ехать, Esc — назад. Обкатка (грунтовка, автодром, объездная) доступна
 * всегда — сборку можно проверять сколько угодно; заезд с Палычем открывается после
 * обкатки, после победы — реванш. На карточке — что проверяет трасса и прогноз сборки.
 */
import { el } from './dom.js';
import { icon } from './icons.js';
import { t } from '../systems/strings.js';
import { getTest } from '../systems/simulate.js';
import { predict } from '../systems/drive.js';
import { gameState } from '../gameState.js';

export const TRIAL_MAPS = ['trial', 'trial_track', 'trial_free'];
const SLIDES = [...TRIAL_MAPS, 'race'];
const ART = { mud: 'is-mud', track: 'is-track', free: 'is-free', drag: 'is-race' };

/**
 * @param {HTMLElement} root слой интерфейса сцены
 * @param {(id: string) => void} onPick id трассы: одна из TRIAL_MAPS или 'race'
 * @param {{ start?: string }} [opts] с какой карточки открыть
 */
export function openMapSelect(root, onPick, { start } = {}) {
  const raceOpen = gameState.passed.trial;
  let index = Math.max(0, SLIDES.indexOf(start ?? gameState.trialMap ?? 'trial'));

  const cards = SLIDES.map((id) => {
    const test = getTest(id);
    const locked = id === 'race' && !raceOpen;
    const kind = id === 'race' ? 'race' : test.practice ? 'practice' : 'trial';
    let verdict = null;
    if (!test.practice && !locked) {
      const r = predict(id, gameState.build, gameState.car);
      verdict = el('p', { class: `mapx__verdict ${r.ok ? 'is-ok' : 'is-bad'}` }, [
        icon(r.ok ? 'check' : 'warning'),
        r.ok ? t('maps.canPass') : (r.reason ?? t('maps.cannot')),
      ]);
    }
    const title =
      id === 'race' ? (gameState.passed.race ? t('maps.rematch') : test.name) : test.map.name;
    return el('article', { class: `mapx ${ART[test.mode]}${locked ? ' is-locked' : ''}` }, [
      el('div', { class: 'mapx__art', 'aria-hidden': 'true' }),
      el('div', { class: 'mapx__body' }, [
        el('span', { class: `mapx__tag is-${kind}`, text: t(`maps.tag.${kind}`) }),
        el('h2', { class: 'mapx__name', text: title }),
        el('p', { class: 'mapx__goal', text: locked ? t('maps.locked') : test.goal }),
        verdict,
      ]),
    ]);
  });

  const go = el('button', { class: 'mapx-go', type: 'button' });
  const dots = el(
    'div',
    { class: 'mapx-dots' },
    SLIDES.map((_, i) =>
      el('button', { type: 'button', 'aria-label': String(i + 1), onclick: () => show(i) }),
    ),
  );
  const track = el('div', { class: 'mapx-track' }, cards);
  const node = el(
    'section',
    { class: 'ui-abs mapx-screen', role: 'dialog', 'aria-modal': 'true' },
    [
      el('header', { class: 'mapx-head' }, [
        el('button', { class: 'mapx-back', type: 'button', onclick: () => close() }, [
          icon('back'),
          t('maps.back'),
        ]),
        el('h1', { text: t('maps.title') }),
      ]),
      el(
        'button',
        {
          class: 'mapx-arrow is-prev',
          type: 'button',
          'aria-label': '←',
          onclick: () => show(index - 1),
        },
        [icon('back')],
      ),
      track,
      el(
        'button',
        {
          class: 'mapx-arrow is-next',
          type: 'button',
          'aria-label': '→',
          onclick: () => show(index + 1),
        },
        [icon('back')],
      ),
      el('footer', { class: 'mapx-foot' }, [dots, go]),
    ],
  );

  function show(i) {
    index = (i + SLIDES.length) % SLIDES.length;
    track.style.transform = `translateX(${-index * 100}%)`;
    cards.forEach((c, k) => c.classList.toggle('is-current', k === index));
    [...dots.children].forEach((d, k) => d.classList.toggle('is-on', k === index));
    const id = SLIDES[index];
    const locked = id === 'race' && !raceOpen;
    go.disabled = locked;
    go.replaceChildren(
      icon(locked ? 'warning' : 'play'),
      locked
        ? t('maps.lockedShort')
        : id === 'race'
          ? t('maps.goRace')
          : getTest(id).practice
            ? t('maps.free')
            : t('maps.go'),
    );
  }

  go.onclick = () => {
    const id = SLIDES[index];
    if (id === 'race' && !raceOpen) return;
    if (id !== 'race') gameState.trialMap = id;
    close();
    onPick(id);
  };

  // Клавиши, колесо и свайп.
  const onKey = (e) => {
    if (e.code === 'ArrowRight' || e.code === 'KeyD') show(index + 1);
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') show(index - 1);
    else if (e.code === 'Enter' || e.code === 'Space') go.click();
    else if (e.code === 'Escape') close();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  let wheelAt = 0;
  node.addEventListener('wheel', (e) => {
    if (performance.now() - wheelAt < 350) return;
    wheelAt = performance.now();
    show(index + (e.deltaY + e.deltaX > 0 ? 1 : -1));
  });
  let touchX = null;
  node.addEventListener('pointerdown', (e) => (touchX = e.clientX));
  node.addEventListener('pointerup', (e) => {
    if (touchX === null) return;
    const dx = e.clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 60) show(index + (dx < 0 ? 1 : -1));
  });
  window.addEventListener('keydown', onKey, true);

  function close() {
    window.removeEventListener('keydown', onKey, true);
    node.remove();
  }

  root.append(node);
  show(index);
  return close;
}
