import { el } from './dom.js';
import { icon } from './icons.js';
import { t } from '../systems/strings.js';
import { getTest } from '../systems/simulate.js';
import { predict } from '../systems/drive.js';
import { gameState } from '../gameState.js';
import '../styles/map-select-refresh.css';

export const TRIAL_MAPS = ['trial', 'trial_track', 'trial_free'];
const SLIDES = [...TRIAL_MAPS, 'race'];

function artwork(mode, locked) {
  return el('span', {
    class: `map-picker__art map-picker__art--${mode}${locked ? ' is-locked' : ''}`,
    'aria-hidden': 'true',
  });
}

/**
 * @param {HTMLElement} root слой интерфейса сцены
 * @param {(id: string) => void} onPick id трассы: одна из TRIAL_MAPS или 'race'
 * @param {{ start?: string }} [opts] с какой карточки открыть
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
  const choices = tracks.map(({ test, title, locked }, i) =>
    el('button', { class: 'map-picker__choice', type: 'button', onclick: () => show(i) }, [
      artwork(test.mode, locked),
      el('span', { class: 'map-picker__choice-label' }, [
        title,
        locked ? el('span', { class: 'map-picker__locked', text: t('maps.lockedShort') }) : null,
      ]),
    ]),
  );
  const preview = el('div', { class: 'map-picker__preview' });
  const details = el('div', {
    class: 'map-picker__details',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  });
  const title = el('h1', { id: 'map-picker-title', text: t('maps.title') });
  const panel = el('div', { class: 'map-picker__panel' }, [
    el('header', { class: 'map-picker__header' }, [title, back]),
    el('div', { class: 'map-picker__feature' }, [preview, details]),
    el(
      'div',
      { class: 'map-picker__choices', role: 'group', 'aria-labelledby': title.id },
      choices,
    ),
    el('footer', { class: 'map-picker__footer' }, go),
  ]);
  const node = el(
    'section',
    {
      class: 'map-picker',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': title.id,
      tabindex: '-1',
    },
    panel,
  );

  const background = [...root.children].filter((child) => !child.inert);

  function show(i) {
    index = (i + tracks.length) % tracks.length;
    const { id, test, title, kind, locked, verdict } = tracks[index];
    const startLabel = id === 'race' ? 'maps.goRace' : test.practice ? 'maps.free' : 'maps.go';
    choices.forEach((choice, k) => choice.setAttribute('aria-pressed', String(k === index)));
    preview.replaceChildren(artwork(test.mode, locked));
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
    if (locked && document.activeElement === go) choices[index].focus();
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
    if (e.key === 'Tab') {
      const last = go.disabled ? choices.at(-1) : go;
      if (e.shiftKey && (e.target === back || e.target === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && e.target === last) {
        e.preventDefault();
        back.focus();
      }
      return;
    }

    if (e.altKey || e.ctrlKey || e.metaKey) return;
    switch (e.code) {
      case 'ArrowRight':
      case 'KeyD':
      case 'ArrowLeft':
      case 'KeyA':
        show(index + (e.code === 'ArrowRight' || e.code === 'KeyD' ? 1 : -1));
        if (choices.includes(e.target)) choices[index].focus();
        break;
      case 'Enter':
      case 'Space':
        e.stopPropagation();
        if (e.target === node) {
          e.preventDefault();
          go.click();
        }
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

  let wheelAt = -Infinity;
  panel.addEventListener(
    'wheel',
    (e) => {
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (!horizontal && panel.scrollHeight > panel.clientHeight) return;
      const delta = horizontal ? e.deltaX : e.deltaY;
      if (!delta || e.ctrlKey) return;
      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      if (now - wheelAt < 350) return;
      wheelAt = now;
      show(index + Math.sign(delta));
    },
    { passive: false },
  );

  let swipe = null;
  preview.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    swipe = { x: e.clientX, y: e.clientY };
    preview.setPointerCapture(e.pointerId);
  });
  preview.addEventListener('pointerup', (e) => {
    if (!e.isPrimary || !swipe) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) show(index - Math.sign(dx));
  });
  preview.addEventListener('lostpointercapture', () => (swipe = null));

  root.append(node);
  background.forEach((child) => (child.inert = true));
  show(index);
  node.focus({ preventScroll: true });
  return close;
}
