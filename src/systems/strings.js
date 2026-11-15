import strings from '../../data/strings.json';

/**
 * Текст интерфейса по пути «menu.play» с подстановкой {параметров}.
 * Все тексты лежат в data/strings.json (ТЗ 7.7: тексты не пишем в коде).
 */
export function t(path, params = {}) {
  const value = path.split('.').reduce((node, k) => node?.[k], strings);
  if (typeof value !== 'string') {
    console.warn(`[strings] нет текста: ${path}`);
    return path;
  }
  return value.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''));
}

export function tList(path) {
  const value = path.split('.').reduce((node, k) => node?.[k], strings);
  return Array.isArray(value) ? value : [];
}
