/**
 * Подсказки по наведению: любой элемент с data-tip показывает короткое пояснение.
 * Одна общая плашка на #stage; позиция пересчитывается из экранных координат в пиксели
 * вёрстки 1920×1080 (сцена масштабируется целиком), плашка не выходит за края.
 * На тач-экранах подсказка появляется по долгому касанию и прячется по отпусканию.
 */
const GAP = 12;
let tip = null;
let host = null;

function stageOf(node) {
  return node.closest('#stage') ?? document.getElementById('stage');
}

function show(target) {
  const text = target.dataset.tip;
  const stage = stageOf(target);
  if (!text || !stage) return;
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.setAttribute('role', 'tooltip');
  }
  if (tip.parentNode !== stage) stage.append(tip);
  tip.textContent = text;
  host = target;
  const s = stage.getBoundingClientRect();
  const k = s.width / stage.offsetWidth || 1;
  const r = target.getBoundingClientRect();
  tip.hidden = false;
  tip.dataset.place = 'top';
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  let x = (r.left - s.left + r.width / 2) / k - w / 2;
  let y = (r.top - s.top) / k - h - GAP;
  if (y < 16) {
    y = (r.bottom - s.top) / k + GAP;
    tip.dataset.place = 'bottom';
  }
  x = Math.max(16, Math.min(stage.offsetWidth - w - 16, x));
  tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

function hide() {
  if (tip) tip.hidden = true;
  host = null;
}

/** Подключить подсказки один раз на всю страницу. */
export function initTooltips(root = document) {
  root.addEventListener('pointerover', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (t && t !== host) show(t);
    else if (!t && host) hide();
  });
  root.addEventListener('pointerout', (e) => {
    if (host && !host.contains(e.relatedTarget)) hide();
  });
  root.addEventListener('pointerdown', hide, true);
  window.addEventListener('blur', hide);
}

/** Повесить подсказку на элемент. */
export function withTip(node, text) {
  if (text) node.dataset.tip = text;
  return node;
}
