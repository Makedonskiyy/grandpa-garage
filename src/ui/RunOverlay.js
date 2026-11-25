/**
 * RunOverlay — итог заезда поверх остановившейся игры: значок, крупный заголовок,
 * короткое «почему» и две кнопки. Провал — красное свечение и «Попробовать снова»,
 * успех — зелёное и «Дальше». «Показать детали» ведёт на подробный разбор сборки.
 */
import { el } from './dom.js';
import { icon } from './icons.js';

/**
 * @param {HTMLElement} ui слой интерфейса сцены
 * @param {{ ok: boolean, title: string, text?: string, primary: { label: string, onClick: () => void },
 *   details: { label: string, onClick: () => void } }} o
 */
export function showRunOverlay(ui, o) {
  const primary = el(
    'button',
    { class: 'run-over__btn run-over__btn--primary', type: 'button', onclick: o.primary.onClick },
    [icon(o.primaryIcon ?? (o.ok ? 'play' : 'restart')), el('span', { text: o.primary.label })],
  );
  const details = o.details
    ? el(
        'button',
        { class: 'run-over__btn run-over__btn--ghost', type: 'button', onclick: o.details.onClick },
        [icon('info'), el('span', { text: o.details.label })],
      )
    : null;
  const tone = o.tone ?? (o.ok ? 'is-ok' : 'is-bad');
  const node = el(
    'section',
    { class: `ui-abs run-over ${tone}`, role: 'dialog', 'aria-modal': 'true' },
    [
      el('div', { class: 'run-over__glow', 'aria-hidden': 'true' }),
      el('div', { class: 'run-over__body' }, [
        el('div', { class: 'run-over__badge', 'aria-hidden': 'true' }, [
          icon(o.badge ?? (o.ok ? 'check' : 'close')),
        ]),
        el('h1', { class: 'run-over__title', text: o.title }),
        o.text ? el('p', { class: 'run-over__text', text: tidy(o.text) }) : null,
        o.items
          ? el(
              'ol',
              { class: 'run-over__items' },
              o.items.map((it, i) =>
                el('li', {}, [
                  el('span', { class: 'run-over__num', text: String(i + 1) }),
                  el('div', {}, [
                    el('b', { text: tidy(it.title) }),
                    it.text ? el('span', { text: tidy(it.text) }) : null,
                  ]),
                ]),
              ),
            )
          : null,
        el('div', { class: 'run-over__actions' }, [primary, details]),
      ]),
    ],
  );
  ui.append(node);
  // Enter — главная кнопка, без поиска мышкой.
  const onKey = (e) => {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      primary.click();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('keydown', onKey);
    node.remove();
  };
}

/** Неразрывные пробелы у чисел с единицами и «км/ч» — единица не уезжает на новую строку. */
export function tidy(text) {
  return String(text)
    .replace(/(\d)\s+(км\/ч|км|м|с|л\.с\.)/g, '$1\u00a0$2')
    .replace(/км\/ч/g, 'км/\u2060ч')
    .replace(/\s—\s/g, '\u00a0— ');
}

/**
 * Короткое «почему» для итога: причина и первая фраза совета, без длинных объяснений —
 * подробности по кнопке «Показать детали».
 * @param {{ ok: boolean, reason?: string, hint?: string } | null} r
 */
export function runOverText(r) {
  if (!r) return '';
  const first = (s) => (s ? (s.match(/^[^.!?]*[.!?]/)?.[0] ?? s).trim() : '');
  const reason = r.reason ? r.reason.replace(/[.\s]+$/, '') + '.' : '';
  const hint = r.ok ? '' : first(r.hint);
  return [reason, hint].filter(Boolean).join(' ');
}
