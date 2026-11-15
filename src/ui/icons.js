/**
 * Иконки интерфейса — собственные простые SVG (без сторонних наборов и эмодзи).
 * Цвет берут из currentColor, размер задаёт CSS.
 */
const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 3.5v17l15-8.5z"/></svg>',
  help:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/>' +
    '<path fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" d="M8.9 9.2a3.2 3.2 0 1 1 4.6 2.9c-1 .5-1.5 1.1-1.5 2.2v.4"/>' +
    '<circle cx="12" cy="18" r="1.6" fill="#fff"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M10.3 1.5h3.4l.6 3a8 8 0 0 1 2 1.2l2.9-1 1.7 3-2.3 2a8 8 0 0 1 0 2.4l2.3 2-1.7 3-2.9-1a8 8 0 0 1-2 1.2l-.6 3h-3.4l-.6-3a8 8 0 0 1-2-1.2l-2.9 1-1.7-3 2.3-2a8 8 0 0 1 0-2.4l-2.3-2 1.7-3 2.9 1a8 8 0 0 1 2-1.2zM12 8.3a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4z"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg>',
};

/** <span class="icon"> с SVG внутри. Строки — наши константы, не пользовательский ввод. */
export function icon(name) {
  const span = document.createElement('span');
  span.className = `icon icon--${name}`;
  span.innerHTML = ICONS[name] ?? '';
  return span;
}
