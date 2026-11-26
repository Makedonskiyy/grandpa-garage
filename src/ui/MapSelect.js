import { el } from './dom.js';
import { webButton } from './components.js';
import { icon } from './icons.js';
import { t } from '../systems/strings.js';
import { getTest } from '../systems/simulate.js';
import { predict } from '../systems/drive.js';
import { gameState } from '../gameState.js';
import '../styles/map-select-refresh.css';

export const TRIAL_MAPS = ['trial', 'trial_track', 'trial_free'];
const SLIDES = [...TRIAL_MAPS, 'race'];

/**
 * Экран «Куда поедем»: слева маршрутный лист, справа превью выбранной трассы.
 * @param {HTMLElement} root слой интерфейса сцены
 * @param {(id: string) => void} onPick id трассы: одна из TRIAL_MAPS или 'race'
 * @param {{ start?: string, complete?: boolean, onMultiplayer?: () => void }} [opts]
 */
export function openMapSelect(root, onPick, { start, complete = true, onMultiplayer } = {}) {
  const opener = document.activeElement;
  const raceOpen = gameState.passed.trial;
  let index = Math.max(0, SLIDES.indexOf(start ?? gameState.trialMap ?? 'trial'));

  const tracks = SLIDES.map((id) => {
    const test = getTest(id);
    const race = id === 'race';
    const locked = race && !raceOpen;
    const title = race ? (gameState.passed.race ? t('maps.rematch') : test.name) : test.map.name;
    const kind = race ? 'race' : test.practice ? 'practice' : 'trial';
    const verdict = !test.practice && !locked ? predict(id, gameState.build, gameState.car) : null;
    return { id, test, title, kind, locked, verdict };
  });

  const back = webButton(t('maps.back'), close, { icon: 'back' });
  const multiplayer = onMultiplayer
    ? webButton('Мультиплеер', onMultiplayer, { className: 'duel-button' })
    : null;
  const go = webButton('', launch, { variant: 'primary', icon: 'play' });
  const heading = el('h1', { id: 'map-picker-title', text: t('maps.title') });
  const rows = tracks.map(({ title, kind, locked, test }, i) =>
    el('button', { class: 'map-picker__route', type: 'button', onclick: () => show(i) }, [
      el('span', {
        class: 'map-picker__photo map-picker__art--' + test.mode,
        'aria-hidden': 'true',
      }),
      el('span', { class: 'map-picker__route-copy' }, [
        el('span', {
          class: 'map-picker__kind',
          text: t(locked ? 'maps.lockedShort' : 'maps.tag.' + kind),
        }),
        el('strong', { text: title }),
      ]),
    ]),
  );
  const details = el('div', { class: 'map-picker__details', 'aria-live': 'polite' });
  const node = el(
    'section',
    {
      class: 'map-picker',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': heading.id,
      tabindex: '-1',
    },
    [
      el('header', { class: 'map-picker__header' }, [
        heading,
        el('div', { class: 'duel-actions' }, [multiplayer, back]),
      ]),
      el(
        'div',
        { class: 'map-picker__routes', role: 'group', 'aria-labelledby': heading.id },
        rows,
      ),
      el('footer', { class: 'map-picker__footer' }, [details, go]),
    ],
  );

  const background = [...root.children].filter((child) => !child.inert);

  function show(i) {
    index = (i + tracks.length) % tracks.length;
    const { id, test, title, locked, verdict } = tracks[index];
    const startLabel = id === 'race' ? 'maps.goRace' : test.practice ? 'maps.free' : 'maps.go';
    rows.forEach((row, k) => row.setAttribute('aria-pressed', String(k === index)));
    details.replaceChildren(
      el('h2', { text: title }),
      el('p', { class: 'map-picker__goal', text: locked ? t('maps.locked') : test.goal }),
    );
    if (verdict) {
      details.append(
        el('p', { class: `map-picker__verdict ${verdict.ok ? 'is-ok' : 'is-bad'}` }, [
          icon(verdict.ok ? 'check' : 'warning'),
          verdict.ok ? t('maps.canPass') : (verdict.reason ?? t('maps.cannot')),
        ]),
      );
    }
    if (!complete && !locked)
      details.append(el('p', { text: 'Установи недостающие детали в гараже.' }));
    go.disabled = locked || !complete;
    go.querySelector('.wbtn__label').textContent = t(locked ? 'maps.lockedShort' : startLabel);
  }

  function launch() {
    const { id, locked } = tracks[index];
    if (locked || !complete) return;
    if (id !== 'race') gameState.trialMap = id;
    close();
    onPick(id);
  }

  function close() {
    if (!node.parentNode) return;
    node.remove();
    background.forEach((child) => (child.inert = false));
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }

  node.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    switch (e.code) {
      case 'ArrowRight':
      case 'ArrowDown':
      case 'KeyS':
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'KeyW':
        show(index + (['ArrowRight', 'ArrowDown', 'KeyS'].includes(e.code) ? 1 : -1));
        if (rows.includes(e.target)) rows[index].focus();
        break;
      case 'Enter':
      case 'NumpadEnter':
        e.stopPropagation();
        if (e.target === go || e.target === back || e.target === multiplayer) return;
        e.preventDefault();
        go.click();
        return;
      case 'Space':
        e.stopPropagation();
        return;
      case 'Escape':
        close();
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  });

  root.append(node);
  background.forEach((child) => (child.inert = true));
  show(index);
  node.focus({ preventScroll: true });
  return close;
}
