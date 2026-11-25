import { el } from './dom.js';
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
 * @param {{ start?: string }} [opts] с какой строки открыть
 */
export function openMapSelect(root, onPick, { start } = {}) {
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

  const back = el('button', { class: 'map-picker__back', type: 'button', onclick: close }, [
    icon('back'),
    t('maps.back'),
  ]);
  const go = el('button', { class: 'map-picker__go', type: 'button', onclick: launch });
  const heading = el('h1', { id: 'map-picker-title', text: t('maps.title') });
  const rows = tracks.map(({ title, kind, locked, verdict }, i) =>
    el(
      'button',
      {
        class: `map-picker__row${locked ? ' is-locked' : ''}`,
        type: 'button',
        onclick: () => show(i),
        onpointerenter: (e) => {
          if (e.pointerType === 'mouse') show(i);
        },
        onfocus: () => show(i),
      },
      [
        el('span', { class: 'map-picker__num', text: String(i + 1).padStart(2, '0') }),
        el('span', { class: 'map-picker__row-main' }, [
          el('span', { class: 'map-picker__row-name', text: title }),
          el('span', { class: 'map-picker__row-meta' }, [
            el('span', { class: 'map-picker__kind', text: t(`maps.tag.${kind}`) }),
            locked ? el('span', { class: 'map-picker__lock', text: t('maps.lockedShort') }) : null,
            verdict
              ? el('span', {
                  class: `map-picker__dot ${verdict.ok ? 'is-ok' : 'is-bad'}`,
                  title: verdict.ok ? t('maps.canPass') : t('maps.cannot'),
                })
              : null,
          ]),
        ]),
      ],
    ),
  );
  const art = el('div', { class: 'map-picker__art', 'aria-hidden': 'true' });
  const details = el('div', {
    class: 'map-picker__details',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  });
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
      el('aside', { class: 'map-picker__list' }, [
        heading,
        el(
          'div',
          { class: 'map-picker__rows', role: 'group', 'aria-labelledby': heading.id },
          rows,
        ),
        back,
      ]),
      el('div', { class: 'map-picker__stage' }, [
        art,
        el('div', { class: 'map-picker__bottom' }, [details, go]),
      ]),
    ],
  );

  const background = [...root.children].filter((child) => !child.inert);

  function show(i) {
    index = (i + tracks.length) % tracks.length;
    const { id, test, title, kind, locked, verdict } = tracks[index];
    const startLabel = id === 'race' ? 'maps.goRace' : test.practice ? 'maps.free' : 'maps.go';
    rows.forEach((row, k) => row.setAttribute('aria-pressed', String(k === index)));
    art.className = `map-picker__art map-picker__art--${test.mode}${locked ? ' is-locked' : ''}`;
    details.replaceChildren(
      el('span', { class: 'map-picker__kind', text: t(`maps.tag.${kind}`) }),
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
    go.disabled = locked;
    go.replaceChildren(
      icon(locked ? 'warning' : 'play'),
      t(locked ? 'maps.lockedShort' : startLabel),
    );
  }

  function launch() {
    const { id, locked } = tracks[index];
    if (locked) return;
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
      case 'ArrowDown':
      case 'KeyS':
      case 'ArrowUp':
      case 'KeyW':
        show(index + (e.code === 'ArrowDown' || e.code === 'KeyS' ? 1 : -1));
        if (rows.includes(e.target)) rows[index].focus();
        break;
      case 'Enter':
      case 'NumpadEnter':
        e.stopPropagation();
        if (e.target === go || e.target === back) return;
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
